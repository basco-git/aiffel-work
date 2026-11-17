"""회사 유형 분석 (2026-11-17 추가, 사용자 요청).

질문: "연봉·복지가 좋은 대기업형과 그렇지 않은 중소기업형에서, 이 프로젝트의 결론이 그대로 유지되는가?"

출발점(대명제): 연봉·복지 만족이 낮을수록 이직이 많다. 국내 연구에서 정규직 청년 이직률은
대기업 17.2%, 중소·소기업 약 25%였다(문영만·홍장표 2017, 산업노동연구 23(2)).

방법
- generate_data.generate(company=...)로 같은 직원·같은 추첨에서 연봉·복지 만족만 옮긴 회사를 만든다.
  (대기업형 +0.4, 중소기업형 -0.4. 퇴사율 비율이 연구의 약 1.5배에 가깝도록 정함)
- 퇴사 위험 규칙과 면담 효과 규칙은 기준 회사와 같다. 시나리오 B의 효과 평균도 같게 맞춘다.
- 분석 절차는 본 실행(train_eval.py)과 같다: 시험 30% 고정, 1단계 로지스틱(보정), 2단계 배분 5가지.
  효과 추정기는 본 실행에서 A·B 모두 선택된 두 모델 비교법·로지스틱으로 고정한다.
- 입력은 예시값(대체 비용 3,000만 원, 팀장 30만 원, 임원 150만 원, 성공률 0.3, 팀장 20%, 임원 = 시험 인원의 5%).
- 회사 유형 × 시나리오(A·B) × 시드 3개.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

import allocate
from generate_data import COMPANY_SHIFT, generate
from train_eval import (EXAMPLE, FEATURES, KST, RESULTS, TLearner, make_models, needs_authority, ranks,
                        uplift_logit)

LOG = RESULTS.parent / "ml" / "run_log.txt"
COMPANIES = ["대기업형", "기준", "중소기업형"]
METHODS = {"random": "무작위", "risk": "위험 순", "expert": "HR 전문가 규칙", "uplift": "효과 순(추정)",
           "oracle": "진짜 효과 순(상한)"}


def log(msg):
    line = f"{datetime.now(KST):%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_cell(company, scenario, seed, n=9000):
    obs, truth, info = generate(scenario, seed, n, company=company)
    strata = obs["talk_by"] + "_" + obs["left"].astype(str)
    tr, te = train_test_split(np.arange(n), test_size=0.3, stratify=strata, random_state=seed)
    tr, te = np.sort(tr), np.sort(te)
    talk = obs["talk_by"].values
    rng = np.random.default_rng(seed + 1000)

    # 1단계: 대조군 위험 예측
    tr_c, te_c = tr[talk[tr] == "none"], te[talk[te] == "none"]
    model = CalibratedClassifierCV(make_models(seed)["logit"][2], method="isotonic", cv=5)
    model.fit(obs.loc[tr_c, FEATURES], obs.loc[tr_c, "left"])
    p1 = model.predict_proba(obs.loc[te_c, FEATURES])[:, 1]
    y1 = obs.loc[te_c, "left"].values
    tb1 = rng.permutation(len(te_c))
    s1 = allocate.stage1(ranks(p1, tb1), y1, p1, 0.2, EXAMPLE["r"], EXAMPLE["C_replace"], EXAMPLE["C_lead"])

    # 2단계: 시험 전체 행 배분
    Xte = obs.loc[te, FEATURES]
    th = TLearner(uplift_logit, seed).fit(obs.loc[tr, FEATURES], talk[tr], obs.loc[tr, "left"].values).tau(Xte)
    d = {"tiebreak": rng.permutation(len(te)), "risk": model.predict_proba(Xte)[:, 1],
         "tau_lead": truth.loc[te, "tau_lead"].values, "tau_exec": truth.loc[te, "tau_exec"].values,
         "tau_hat_lead": th["lead"], "tau_hat_exec": th["exec"],
         "leader_conflict": obs.loc[te, "leader_conflict"].values, "needs_authority": needs_authority(obs.loc[te])}
    m = int(round(0.05 * len(te)))
    args = (m, 0.2, EXAMPLE["C_replace"], EXAMPLE["C_lead"], EXAMPLE["C_exec"])
    s2 = {}
    for mid in METHODS:
        r = allocate.stage2(mid, d, *args)
        s2[mid] = {"net": r["net"], "saved": r["saved"], "backfire": r["backfire"]}

    profile = {
        "leave_rate": info["leave_rate"],
        "mean_sat_pay": float(obs["sat_pay"].mean()), "mean_sat_benefits": float(obs["sat_benefits"].mean()),
        "low_pay_share": float((obs["sat_pay"] <= 2).mean()),
        "needs_authority_share": float(needs_authority(obs).mean()),
        "decided_rate": info["decided_rate"],
    }
    stage1 = {"auc": float(roc_auc_score(y1, p1)), "n_test": int(len(te_c)), "leavers": int(y1.sum()),
              "top20": {"S": s1["S"], "TP": s1["TP"], "net": s1["net"]},
              "threshold": s1["threshold"]}
    return profile, stage1, s2, m, len(te)


def mean(vals):
    return round(float(np.mean(vals)), 4)


def main():
    ap = argparse.ArgumentParser(description="회사 유형 분석")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--repeats", type=int, default=3)
    a = ap.parse_args()
    seeds = [a.seed + i for i in range(a.repeats)]
    t0 = time.time()
    log(f"[시작] 회사 유형 분석 (유형 {COMPANIES}, 이동량 {COMPANY_SHIFT}, 시드 {seeds})")
    cells = []
    for company in COMPANIES:
        for sc in "AB":
            runs = [run_cell(company, sc, sd) for sd in seeds]
            prof = {k: mean([r[0][k] for r in runs]) for k in ("mean_sat_pay", "mean_sat_benefits", "low_pay_share",
                                                               "needs_authority_share", "decided_rate")}
            prof["leave_rate"] = {arm: mean([r[0]["leave_rate"][arm] for r in runs]) for arm in ("none", "lead", "exec")}
            st1 = {"auc": mean([r[1]["auc"] for r in runs]),
                   "leavers": mean([r[1]["leavers"] for r in runs]), "n_test": runs[0][1]["n_test"],
                   "top20_net": mean([r[1]["top20"]["net"] for r in runs]),
                   "top20_TP": mean([r[1]["top20"]["TP"] for r in runs]),
                   "threshold_S": mean([r[1]["threshold"]["S"] for r in runs]),
                   "threshold_net": mean([r[1]["threshold"]["net"] for r in runs])}
            st2 = {}
            for mid, label in METHODS.items():
                nets = [r[2][mid]["net"] for r in runs]
                risk = [r[2]["risk"]["net"] for r in runs]
                st2[mid] = {"label": label, "net": mean(nets), "saved": mean([r[2][mid]["saved"] for r in runs]),
                            "backfire": mean([r[2][mid]["backfire"] for r in runs]),
                            "ratio_to_risk": mean([x / y for x, y in zip(nets, risk)]),
                            "wins_over_risk": int(sum(x > y for x, y in zip(nets, risk)))}
            best = max((k for k in METHODS if k != "oracle"), key=lambda k: st2[k]["net"])
            cells.append({"company": company, "scenario": sc, "profile": prof, "stage1": st1, "stage2": st2,
                          "best_non_oracle": best, "m": runs[0][3], "n_test2": runs[0][4]})
            log(f"  {company} {sc}: 면담 없음 퇴사율 {prof['leave_rate']['none']:.3f}, 연봉 만족 평균 {prof['mean_sat_pay']:.2f}, "
                f"1단계 AUC {st1['auc']:.3f}, 문턱 인원 {st1['threshold_S']:.0f}명, "
                f"2단계 순이익(억) 위험 {st2['risk']['net'] / 1e8:.2f} / 규칙 {st2['expert']['net'] / 1e8:.2f} / "
                f"효과 {st2['uplift']['net'] / 1e8:.2f} / 상한 {st2['oracle']['net'] / 1e8:.2f}, 최고 {METHODS[best]}")
    out = {
        "question": "연봉·복지 수준이 다른 회사 유형에서도 결론이 유지되는가",
        "premise": "연봉·복지 만족이 낮을수록 이직이 많다(정규직 청년 이직률 대기업 17.2%, 중소·소기업 약 25%; 문영만·홍장표 2017)",
        "shift": COMPANY_SHIFT, "seeds": seeds,
        "fixed": {"risk_model": "로지스틱(보정)", "uplift": "두 모델 비교법·로지스틱",
                  "inputs": {**EXAMPLE, "k": 0.2, "m_rule": "시험 인원의 5%"}},
        "note": "값은 시드 3개 평균. 2단계 순이익과 막은 퇴사는 진짜 효과로 채점(가상 데이터라서 가능).",
        "runtime_sec": round(time.time() - t0, 1), "cells": cells,
    }
    (RESULTS / "company_type.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"[완료] 회사 유형 분석 ({out['runtime_sec']}초) → results/company_type.json")


if __name__ == "__main__":
    main()
