"""민감도 분석 (PRD §6.6, INTERVIEW Q10): 시범 인원 n × 궁합 강도 s.

질문: "시범 면담을 몇 명 하면 효과 추정(업리프트)이 위험 순을 넘는가?"
- 조건마다 시드 3개로 반복해 평균과 최소·최대를 남긴다.
- 위험 모델은 본 실행의 대표 모델(로지스틱, 보정)로 고정한다.
- 효과 추정기는 두 모델 비교법(T-learner)의 부스팅·로지스틱 **두 가지를 모두** 돌려 따로 기록한다.
  대표값(benefit_ratio 등)은 본 실행(results/meta.json)에서 시나리오 B에 대해 교차검증으로 고른 추정기를 쓴다.
  2026-11-16 22:0x 변경: 이전에는 부스팅 하나로 고정했는데, 나이 분포 수정 후 본 실행에서 로지스틱이 선택되어
  본 실행과 민감도 결과가 모순되었다(ANALYSIS_LOG 참고). 조건마다 교차검증 선택을 하면 시간이 크게 늘어 두 가지를 모두 기록하는 방식을 택했다.
- 배분 입력은 예시값(팀장 20%, 임원 = 시험 인원의 5%)으로 고정한다.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split

import allocate
from generate_data import generate
from train_eval import EXAMPLE, FEATURES, RESULTS, TLearner, make_models, needs_authority, uplift_hgb, uplift_logit

LEARNERS = {"t_hgb": uplift_hgb, "t_logit": uplift_logit}

NS = [9000, 30000, 90000, 300000]  # 300,000은 21:3x 추가: 30,000에서도 효과 순이 위험 순 미달이라 교차점 탐색용
STRENGTHS = [0.0, 0.5, 1.0]


def run_cell(n, s, seed):
    obs, truth, _ = generate("B", seed, n, sigma=1.0, strength=s)
    strata = obs["talk_by"] + "_" + obs["left"].astype(str)
    tr, te = train_test_split(np.arange(n), test_size=0.3, stratify=strata, random_state=seed)
    talk = obs["talk_by"].values
    tr_c = tr[talk[tr] == "none"]
    risk_model = CalibratedClassifierCV(make_models(seed)["logit"][2], method="isotonic", cv=5)
    risk_model.fit(obs.loc[tr_c, FEATURES], obs.loc[tr_c, "left"])
    Xte = obs.loc[te, FEATURES]
    rng = np.random.default_rng(seed + 1000)
    d = {"tiebreak": rng.permutation(len(te)), "risk": risk_model.predict_proba(Xte)[:, 1],
         "tau_lead": truth.loc[te, "tau_lead"].values, "tau_exec": truth.loc[te, "tau_exec"].values,
         "leader_conflict": obs.loc[te, "leader_conflict"].values, "needs_authority": needs_authority(obs.loc[te])}
    m = int(round(0.05 * len(te)))
    args = (m, 0.2, EXAMPLE["C_replace"], EXAMPLE["C_lead"], EXAMPLE["C_exec"])
    net = {mid: allocate.stage2(mid, d, *args)["net"] for mid in ("risk", "expert", "oracle")}
    corr = {}
    for lid, make in LEARNERS.items():
        th = TLearner(make, seed).fit(obs.loc[tr, FEATURES], talk[tr], obs.loc[tr, "left"].values).tau(Xte)
        dd = {**d, "tau_hat_lead": th["lead"], "tau_hat_exec": th["exec"]}
        net[f"uplift_{lid}"] = allocate.stage2("uplift", dd, *args)["net"]
        corr[lid] = {arm: float(spearmanr(th[arm], d[f"tau_{arm}"]).statistic) for arm in ("lead", "exec")}
    return net, corr, m, len(te)


def main():
    ap = argparse.ArgumentParser(description="민감도 분석")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--n", type=int, default=None, help="run_all 호환용(사용하지 않음)")
    a = ap.parse_args()
    seeds = [a.seed + i for i in range(a.repeats)]
    meta = json.loads((RESULTS / "meta.json").read_text(encoding="utf-8"))
    rep = meta["scenarios"]["B"]["uplift_method"]  # 본 실행에서 B에 대해 교차검증으로 고른 추정기
    if rep not in LEARNERS:
        rep = "t_logit"
    t0 = time.time()
    cells = []

    def stat(vals):
        return {"mean": round(float(np.mean(vals)), 4), "min": round(float(np.min(vals)), 4),
                "max": round(float(np.max(vals)), 4)} if vals else None

    for n in NS:
        for s in STRENGTHS:
            runs = []
            for sd in seeds:
                t1 = time.time()
                net, corr, m, n_test = run_cell(n, s, sd)
                runs.append({"seed": sd, "net": net, "corr": corr})
                print(f"  n {n:>6} 궁합 {s:.1f} 시드 {sd}: 순이익(억) 위험 {net['risk'] / 1e8:.2f}, 규칙 {net['expert'] / 1e8:.2f}, "
                      f"효과(부스팅) {net['uplift_t_hgb'] / 1e8:.2f}, 효과(로지스틱) {net['uplift_t_logit'] / 1e8:.2f}, "
                      f"상한 {net['oracle'] / 1e8:.2f} ({time.time() - t1:.0f}초)", flush=True)

            def learner_stats(lid):
                key = f"uplift_{lid}"
                ratios = [r["net"][key] / r["net"]["risk"] for r in runs if r["net"]["risk"] > 0]
                return {"net_uplift": stat([r["net"][key] for r in runs]),
                        "benefit_ratio": stat(ratios),
                        "uplift_wins": sum(r["net"][key] > r["net"]["risk"] for r in runs),
                        "corr_exec": stat([r["corr"][lid]["exec"] for r in runs]),
                        "corr_lead": stat([r["corr"][lid]["lead"] for r in runs])}

            by = {lid: learner_stats(lid) for lid in LEARNERS}
            ratio_e = [r["net"]["expert"] / r["net"]["risk"] for r in runs if r["net"]["risk"] > 0]
            cells.append({
                "n": n, "strength": s, "n_test": n_test, "m": m, "seeds": seeds,
                "net_risk": stat([r["net"]["risk"] for r in runs]),
                "net_expert": stat([r["net"]["expert"] for r in runs]),
                "net_oracle": stat([r["net"]["oracle"] for r in runs]),
                "expert_ratio": stat(ratio_e),
                **by[rep],                # 대표 추정기 값 (웹 F16이 읽는 필드)
                "by_learner": by,         # 두 추정기 모두
            })
    out = {"n": NS, "strength": STRENGTHS, "repeats": a.repeats,
           "inputs": {"k": 0.2, "m_rule": "시험 인원의 5%", **{k: v for k, v in EXAMPLE.items() if k != "r"}},
           "fixed": {"risk_model": "logit(보정)", "uplift": f"대표 = {rep} (본 실행 B의 교차검증 선택), by_learner에 t_hgb·t_logit 모두",
                     "sigma": 1.0, "scenario_base": "B"},
           "representative_learner": rep,
           "note": "값은 위험 순 대비 순이익 비율(1보다 크면 위험 순보다 나음)이고, 시드 3개의 평균입니다. 효과 순은 본 실행에서 고른 추정 방법(" + {"t_hgb": "두 모델 비교법·부스팅", "t_logit": "두 모델 비교법·로지스틱"}[rep] + ") 기준이며, 두 추정 방법의 값은 보고서에 함께 있습니다.",
           "runtime_sec": round(time.time() - t0, 1), "cells": cells}
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "sensitivity.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  저장: sensitivity.json ({out['runtime_sec']}초)")


if __name__ == "__main__":
    main()
