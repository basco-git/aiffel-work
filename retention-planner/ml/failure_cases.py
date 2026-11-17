"""실패 사례 모으기 (2026-11-17 추가, 과제 기준 "실패 사례도 함께").

본 실행 결과(results/<A|B>/scores.json)와 가상 데이터의 진짜 값(data/truth_*.csv)을 합쳐,
각 배정 방법이 어디서 틀렸는지 유형별로 세고 대표 사례를 뽑는다.

유형
1. 임원 슬롯 낭비: 이미 마음을 굳혀(decided) 어떤 면담에도 반응하지 않는 사람에게 임원 면담을 배정
2. 역효과 배정: 팀장 면담을 받으면 오히려 퇴사 확률이 오르는 사람(팀장 갈등)에게 팀장 면담을 배정
3. 놓친 퇴사자(1단계): 위험 점수가 낮은 절반에 있었는데 실제로 떠난 사람
4. 효과 추정의 빗나감: 추정 효과는 상위 5%인데 진짜 효과는 하위 절반인 사람

사례 표의 '가상 직원 번호'는 data/employees_B.csv의 직원번호(가상)이다. 실제 사람이 아니다.
"""

from __future__ import annotations

import json
from datetime import datetime

import numpy as np

import allocate
from generate_data import read_data
from train_eval import DATA, EXAMPLE, KST, RESULTS

LOG = RESULTS.parent / "ml" / "run_log.txt"
METHODS = {"risk": "위험 순", "expert": "HR 전문가 규칙", "uplift": "효과 순(추정)"}
SAT = {"sat_pay": "연봉", "sat_job_fit": "원하는 업무", "sat_benefits": "복지", "sat_direction": "회사 방향"}


def log(msg):
    line = f"{datetime.now(KST):%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def reasons(row):
    """사람이 읽는 사유 요약: 만족 2 이하인 항목과 팀장 갈등."""
    r = [f"{ko} 불만({int(row[c])})" for c, ko in SAT.items() if row[c] <= 2]
    if row["leader_conflict"] == 1:
        r.append("팀장 갈등")
    return ", ".join(r) if r else "뚜렷한 불만 없음"


def person(df, tr, i, d, extra=None):
    row, t = df.iloc[i], tr.iloc[i]
    out = {"가상 직원 번호": int(row["emp_id"]), "사유": reasons(row), "위험 점수": round(float(d["risk_of"][i]), 3),
           "이미 결심": int(t["decided"]), "진짜 효과(팀장)": round(float(t["tau_lead"]), 3),
           "진짜 효과(임원)": round(float(t["tau_exec"]), 3)}
    out.update(extra or {})
    return out


def main():
    log("[시작] 실패 사례 모으기")
    split = json.loads((DATA / "split.json").read_text(encoding="utf-8"))
    te = np.array(split["test"])
    out = {"note": "본 실행(시드 42) 시험 자료 기준. 진짜 값은 가상 데이터라서 알 수 있다.", "scenarios": {}}
    for sc in "AB":
        sco = json.loads((RESULTS / sc / "scores.json").read_text(encoding="utf-8"))["stage2"]
        df = read_data(DATA / f"employees_{sc}.csv").iloc[te].reset_index(drop=True)
        tr = read_data(DATA / f"truth_{sc}.csv").iloc[te].reset_index(drop=True)
        d = {k: np.asarray(v) for k, v in sco.items() if isinstance(v, list)}
        d["risk_of"] = d["risk"]
        n = len(te)
        m = int(round(0.05 * n))
        args = (m, 0.2, EXAMPLE["C_replace"], EXAMPLE["C_lead"], EXAMPLE["C_exec"])
        assign = {mid: allocate.assign(mid, d, *args) for mid in METHODS}
        # 면담 효과가 없는 사람: 진짜 임원 효과가 0 이하(B의 이미 결심한 사람). A는 결심 여부와 상관없이 효과가 같다.
        decided = tr["tau_exec"].values <= 0
        neg_lead = tr["tau_lead"].values < 0

        counts = {}
        for mid, label in METHODS.items():
            a = assign[mid]
            counts[mid] = {"label": label,
                           "임원 슬롯 낭비(이미 결심한 사람에게 임원 면담)": int((a == "exec")[decided].sum()),
                           "역효과 배정(팀장 갈등자에게 팀장 면담)": int(((a == "lead") & neg_lead).sum()),
                           "임원 배정 인원": int((a == "exec").sum()), "팀장 배정 인원": int((a == "lead").sum())}

        examples = {}
        # 1. 위험 순이 임원 슬롯을 쓴 이미 결심한 사람 중 위험 점수가 가장 높은 3명
        idx = np.where((assign["risk"] == "exec") & decided)[0]
        idx = idx[np.argsort(-d["risk"][idx])][:3]
        examples["임원 슬롯 낭비 (위험 순)"] = [person(df, tr, i, d, {"HR 규칙 배정": assign["expert"][i] or "없음"}) for i in idx]
        # 2. 위험 순이 팀장 면담을 준 팀장 갈등자 중 역효과가 가장 큰 3명
        idx = np.where((assign["risk"] == "lead") & neg_lead)[0]
        idx = idx[np.argsort(tr["tau_lead"].values[idx])][:3]
        examples["역효과 배정 (위험 순)"] = [person(df, tr, i, d, {"HR 규칙 배정": assign["expert"][i] or "없음"}) for i in idx]
        # 3. 놓친 퇴사자: 면담 없음 갈래에서 위험 점수 하위 절반인데 떠난 사람(위험 점수가 가장 낮은 3명)
        none = d["talk_by"] == "none"
        low = d["risk"] < np.median(d["risk"][none])
        idx = np.where(none & low & (d["left"] == 1))[0]
        miss = {"면담 없음 갈래 퇴사자": int((none & (d["left"] == 1)).sum()), "그중 위험 점수 하위 절반": int(len(idx))}
        idx = idx[np.argsort(d["risk"][idx])][:3]
        examples["놓친 퇴사자 (1단계 점수)"] = [person(df, tr, i, d) for i in idx]
        # 4. 효과 추정의 빗나감: 추정 임원 효과 상위 5%인데 진짜 임원 효과 하위 절반
        th, tt = d["tau_hat_exec"], tr["tau_exec"].values
        top = th >= np.quantile(th, 0.95)
        wrong = top & (tt < np.median(tt))
        idx = np.where(wrong)[0]
        idx = idx[np.argsort(tt[idx])][:3]
        examples["효과 추정 빗나감 (임원 효과)"] = [person(df, tr, i, d, {"추정 효과(임원)": round(float(th[i]), 3)}) for i in idx]

        out["scenarios"][sc] = {"counts": counts, "missed": miss,
                                "uplift_top5_wrong": {"추정 상위 5%": int(top.sum()), "그중 진짜 하위 절반": int(wrong.sum())},
                                "examples": examples}
        log(f"  {sc}: " + ", ".join(f"{v['label']} 임원 낭비 {v['임원 슬롯 낭비(이미 결심한 사람에게 임원 면담)']}명·역효과 "
                                    f"{v['역효과 배정(팀장 갈등자에게 팀장 면담)']}명" for v in counts.values())
            + f" / 놓친 퇴사자 {miss['그중 위험 점수 하위 절반']}/{miss['면담 없음 갈래 퇴사자']}명"
            + f" / 효과 추정 빗나감 {int(wrong.sum())}/{int(top.sum())}명")
    (RESULTS / "failure_cases.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    log("[완료] 실패 사례 → results/failure_cases.json")


if __name__ == "__main__":
    main()
