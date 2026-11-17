"""가상 직원 데이터 생성 (PRD §5).

같은 시드면 같은 파일이 나온다. 시나리오 A와 B는 같은 직원·같은 무작위 추첨을 쓰고
면담 효과 규칙만 다르다. 실제 사람·회사 자료는 쓰지 않는다.

생성 규칙 표 (최종 값 — 바꾸면 PRD §5.4·§5.5와 meta.json도 함께 갱신)

① 면담하지 않았을 때의 퇴사 위험: logit0 = b0 + Σ(계수 × 표준화 열) + σ·잡음
   | 요인                    | 계수  |
   |-------------------------|-------|
   | leader_conflict (0/1)   | +0.9  |  원척도
   | sat_pay                 | -0.6  |
   | sat_job_fit             | -0.6  |
   | sat_direction           | -0.5  |
   | overtime_hours_month    | +0.5  |
   | sat_benefits            | -0.3  |
   | years_since_promotion   | +0.3  |
   | monthly_income_rank     | -0.3  |
   | tenure_years < 1 (0/1)  | +0.4  |  원척도
   | commute_minutes         | +0.2  |
   | training_hours_year     | -0.2  |
   | age                     | -0.25 |  민감 열, 의도적 설계
   | gender, marital_status  |  0    |
   b0: 대조군 기대 퇴사율이 TARGET_LEAVE_RATE가 되도록 이분법으로 자동 결정

② 면담 효과 δ (로짓에서 뺌), low_x = (5 - sat_x) / 4
   A: δ_lead = 0.4, δ_exec = 0.8 (모두 같음)
   B: δ_lead = max(0.3 + 0.3·low_job_fit + 0.1·low_direction - 0.8·leader_conflict, -0.4)
      δ_exec = 0.2 + 0.6·low_pay + 0.5·low_job_fit + 0.2·low_benefits
               + 0.7·leader_conflict + 0.6·low_direction
      decided = 1 이면 둘 다 0, 그 뒤 평균이 A와 같도록(0.4, 0.8) 배율 조정
   궁합 강도 s(민감도용): δ = (1 - s)·δ_A + s·δ_B   (A는 s = 0, B는 기본 s = 1)

③ 회사 유형(company_type.py용, 2026-11-17 추가): 연봉·복지 만족의 잠재값을 ±COMPANY_SHIFT만큼 옮긴다.
   퇴사 위험은 "기준" 회사의 표준화 기준과 b0를 그대로 써서 계산한다(그래야 만족도 차이가 퇴사율 차이로 나타남).
   기본값 "기준"은 이전과 같은 데이터를 만든다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

TARGET_LEAVE_RATE = 0.15
ASSIGNMENT = {"none": 0.4, "lead": 0.3, "exec": 0.3}
DEPARTMENTS = ["영업", "개발", "인사·총무", "생산", "마케팅"]
DEPT_PROB = [0.25, 0.30, 0.10, 0.20, 0.15]
DEPT_OVERTIME = {"영업": 22, "개발": 28, "인사·총무": 12, "생산": 25, "마케팅": 18}

RISK_COEF = {
    "sat_pay": -0.6,
    "sat_job_fit": -0.6,
    "sat_direction": -0.5,
    "overtime_hours_month": 0.5,
    "sat_benefits": -0.3,
    "years_since_promotion": 0.3,
    "monthly_income_rank": -0.3,
    "commute_minutes": 0.2,
    "training_hours_year": -0.2,
    "age": -0.25,
}
RAW_COEF = {"leader_conflict": 0.9, "tenure_under_1": 0.4}  # 표준화하지 않는 0/1 열

EFFECT_A = {"lead": 0.4, "exec": 0.8}
EFFECT_B = {
    "lead": {"base": 0.3, "low_job_fit": 0.3, "low_direction": 0.1, "leader_conflict": -0.8, "floor": -0.4},
    "exec": {"base": 0.2, "low_pay": 0.6, "low_job_fit": 0.5, "low_benefits": 0.2,
             "leader_conflict": 0.7, "low_direction": 0.6},
}

# 회사 유형: 연봉(sat_pay)·복지(sat_benefits) 만족 잠재값의 이동량. 대기업 ≈ 연봉·복지가 좋음(INTERVIEW 11-17 대명제).
# 크기는 국내 연구의 대기업:중소기업 정규직 청년 이직률 비율(17.2% : 약 25%, 약 1.5배)에 가깝도록 정했다(ANALYSIS_LOG 11-17).
COMPANY_SHIFT = {"기준": 0.0, "대기업형": 0.4, "중소기업형": -0.4}

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# CSV 열 이름 (코드 이름 → 파일에 쓰는 한글 이름)
COLUMNS_KO = {
    "emp_id": "직원번호", "department": "부서", "job_level": "직급", "tenure_years": "근속연수",
    "years_since_promotion": "승진후기간", "monthly_income_rank": "급여상대수준",
    "overtime_hours_month": "월야근시간", "commute_minutes": "통근분", "training_hours_year": "연교육시간",
    "sat_pay": "연봉만족", "sat_job_fit": "원하는업무", "sat_benefits": "복지만족",
    "leader_conflict": "팀장등갈등", "sat_direction": "회사방향신뢰",
    "age": "나이", "gender": "성별", "marital_status": "혼인", "talk_by": "면담", "left": "퇴사",
    "decided": "이미결심", "p_none": "퇴사확률_면담없음", "p_lead": "퇴사확률_팀장면담",
    "p_exec": "퇴사확률_임원면담", "tau_lead": "효과_팀장면담", "tau_exec": "효과_임원면담",
}
TALK_KO = {"none": "면담없음", "lead": "팀장", "exec": "임원"}


def to_ko(df: pd.DataFrame) -> pd.DataFrame:
    out = df.rename(columns=COLUMNS_KO)
    if "면담" in out:
        out["면담"] = out["면담"].map(TALK_KO)
    return out


def read_data(path: Path) -> pd.DataFrame:
    """한글 CSV를 읽어 코드용 영문 열 이름·값으로 되돌린다."""
    df = pd.read_csv(path, encoding="utf-8-sig")
    df = df.rename(columns={v: k for k, v in COLUMNS_KO.items()})
    if "talk_by" in df:
        df["talk_by"] = df["talk_by"].map({v: k for k, v in TALK_KO.items()})
    return df


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _z(x):
    x = np.asarray(x, dtype=float)
    return (x - x.mean()) / x.std()


def _likert(latent):
    return np.clip(np.round(3 + latent), 1, 5).astype(int)


def _draw_population(n: int, seed: int, shift: float = 0.0) -> dict:
    """시나리오와 무관한 모든 난수를 고정 순서로 뽑는다."""
    rng = np.random.default_rng(seed)
    d = {}
    d["department"] = rng.choice(DEPARTMENTS, size=n, p=DEPT_PROB)
    # 나이를 먼저 뽑는다(평균 38세, 22~60세). 2026-11-16 21:5x 수정:
    # 이전에는 근속(평균 5년)에서 나이를 계산해 30세 미만이 57%로 비현실적이었다.
    age = np.clip(np.round(rng.normal(38, 8, n)), 22, 60).astype(int)
    # 근속은 나이가 많을수록 길고, 입사 가능 기간(나이 − 22년)과 25년을 넘지 않는다.
    tenure = np.minimum(np.minimum(rng.exponential(2 + 0.25 * (age - 22), n), age - 22 + 0.5), 25.0)
    d["tenure_years"] = np.round(tenure, 1)
    d["age"] = age
    d["job_level"] = np.clip(np.round(1 + tenure / 5 + rng.normal(0, 0.8, n)), 1, 5).astype(int)
    d["years_since_promotion"] = np.round(tenure * rng.beta(2, 3, n), 1)
    income = rng.uniform(0, 1, n)
    d["monthly_income_rank"] = np.round(income, 3)
    base_ot = np.array([DEPT_OVERTIME[x] for x in d["department"]], dtype=float)
    d["overtime_hours_month"] = np.round(np.clip(base_ot + rng.normal(0, 10, n), 0, 80), 1)
    d["commute_minutes"] = np.clip(np.round(np.exp(rng.normal(np.log(40), 0.5, n))), 5, 180).astype(int)
    d["training_hours_year"] = np.round(rng.gamma(2.0, 10.0, n), 1)

    # 사유 5종: 공통 몰입도 요인 g로 약한 양의 상관
    g = rng.normal(0, 1, n)
    def item(extra=0.0):
        return 0.5 * g + np.sqrt(0.75) * rng.normal(0, 1, n) + extra
    d["sat_pay"] = _likert(item(1.2 * (income - 0.5) + shift))
    d["sat_job_fit"] = _likert(item())
    d["sat_benefits"] = _likert(item(shift))
    d["leader_conflict"] = (rng.uniform(0, 1, n) < sigmoid(-1.9 - 0.5 * g)).astype(int)
    d["sat_direction"] = _likert(item())

    d["gender"] = rng.choice(["남", "여"], size=n, p=[0.55, 0.45])
    married_p = sigmoid((d["age"] - 33) / 4)
    d["marital_status"] = np.where(rng.uniform(0, 1, n) < married_p, "기혼", "미혼")

    # 시범 면담 무작위 배정 (비율을 정확히 맞춘 뒤 섞음)
    counts = {k: int(round(n * v)) for k, v in ASSIGNMENT.items()}
    counts["none"] = n - counts["lead"] - counts["exec"]
    arms = np.concatenate([np.full(c, k) for k, c in counts.items()])
    d["talk_by"] = rng.permutation(arms)

    d["_eps"] = rng.normal(0, 1, n)        # 위험 잡음
    d["_u_decided"] = rng.uniform(0, 1, n)  # 숨은 변수 decided 추첨
    d["_u_left"] = rng.uniform(0, 1, n)     # 퇴사 추첨
    return d


def _solve_b0(rest: np.ndarray, target: float) -> float:
    lo, hi = -15.0, 15.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if sigmoid(mid + rest).mean() < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _risk_rest(d: dict, ref: dict, sigma: float) -> np.ndarray:
    """logit0에서 b0를 뺀 부분. 표준화 기준(평균·표준편차)은 ref 집단에서 가져온다."""
    tenure_under_1 = (d["tenure_years"] < 1).astype(int)
    rest = sigma * d["_eps"]
    for col, c in RISK_COEF.items():
        x, r = np.asarray(d[col], dtype=float), np.asarray(ref[col], dtype=float)
        rest = rest + c * (x - r.mean()) / r.std()
    return rest + RAW_COEF["leader_conflict"] * d["leader_conflict"] + RAW_COEF["tenure_under_1"] * tenure_under_1


def generate(scenario: str = "A", seed: int = 42, n: int = 9000,
             sigma: float = 1.0, strength: float | None = None, company: str = "기준"):
    """관측 데이터, 진짜 값, 생성 정보를 돌려준다.

    strength: 궁합 강도 s. None이면 A → 0, B → 1.
    company: 회사 유형(기준·대기업형·중소기업형). 기준이 아니면 기준 회사의 표준화 기준과 b0를 쓴다.
    """
    if scenario not in ("A", "B"):
        raise ValueError("scenario는 A 또는 B")
    if company not in COMPANY_SHIFT:
        raise ValueError(f"company는 {list(COMPANY_SHIFT)} 중 하나")
    s = (0.0 if scenario == "A" else 1.0) if strength is None else float(strength)
    ref = _draw_population(n, seed)
    d = ref if company == "기준" else _draw_population(n, seed, COMPANY_SHIFT[company])

    b0 = _solve_b0(_risk_rest(ref, ref, sigma), TARGET_LEAVE_RATE)
    logit0 = b0 + _risk_rest(d, ref, sigma)
    p_none = sigmoid(logit0)

    decided = (d["_u_decided"] < 0.5 * p_none).astype(int)
    low = {k: (5 - d[f"sat_{k}"]) / 4 for k in ("pay", "job_fit", "benefits", "direction")}
    conflict = d["leader_conflict"]

    eb = EFFECT_B
    lead_b = np.maximum(eb["lead"]["base"] + eb["lead"]["low_job_fit"] * low["job_fit"]
                        + eb["lead"]["low_direction"] * low["direction"]
                        + eb["lead"]["leader_conflict"] * conflict, eb["lead"]["floor"])
    exec_b = (eb["exec"]["base"] + eb["exec"]["low_pay"] * low["pay"]
              + eb["exec"]["low_job_fit"] * low["job_fit"] + eb["exec"]["low_benefits"] * low["benefits"]
              + eb["exec"]["leader_conflict"] * conflict + eb["exec"]["low_direction"] * low["direction"])
    lead_b = lead_b * (1 - decided)
    exec_b = exec_b * (1 - decided)
    lead_b = lead_b * EFFECT_A["lead"] / lead_b.mean()
    exec_b = exec_b * EFFECT_A["exec"] / exec_b.mean()

    delta_lead = (1 - s) * EFFECT_A["lead"] + s * lead_b
    delta_exec = (1 - s) * EFFECT_A["exec"] + s * exec_b
    p_lead = sigmoid(logit0 - delta_lead)
    p_exec = sigmoid(logit0 - delta_exec)

    p_assigned = np.select([d["talk_by"] == "lead", d["talk_by"] == "exec"], [p_lead, p_exec], p_none)
    left = (d["_u_left"] < p_assigned).astype(int)

    obs_cols = ["department", "job_level", "tenure_years", "years_since_promotion", "monthly_income_rank",
                "overtime_hours_month", "commute_minutes", "training_hours_year",
                "sat_pay", "sat_job_fit", "sat_benefits", "leader_conflict", "sat_direction",
                "age", "gender", "marital_status", "talk_by"]
    obs = pd.DataFrame({"emp_id": np.arange(1, n + 1)})
    for c in obs_cols:
        obs[c] = d[c]
    obs["left"] = left

    truth = pd.DataFrame({
        "emp_id": obs["emp_id"],
        "decided": decided,
        "p_none": np.round(p_none, 6),
        "p_lead": np.round(p_lead, 6),
        "p_exec": np.round(p_exec, 6),
        "tau_lead": np.round(p_none - p_lead, 6),
        "tau_exec": np.round(p_none - p_exec, 6),
    })

    rates = {arm: round(float(left[d["talk_by"] == arm].mean()), 4) for arm in ASSIGNMENT}
    info = {
        "scenario": scenario, "seed": seed, "n": n, "sigma": sigma, "strength": s, "company": company,
        "b0": round(float(b0), 4), "target_leave_rate": TARGET_LEAVE_RATE,
        "coefficients": {**RISK_COEF, **RAW_COEF},
        "effect": {"A": EFFECT_A, "B": EFFECT_B},
        "leave_rate": rates,
        "decided_rate": round(float(decided.mean()), 4) if s > 0 else 0.0,
        "mean_delta": {"lead": round(float(delta_lead.mean()), 4), "exec": round(float(delta_exec.mean()), 4)},
        "mean_tau": {"lead": round(float(truth["tau_lead"].mean()), 4), "exec": round(float(truth["tau_exec"].mean()), 4)},
        "negative_tau_lead_share": round(float((truth["tau_lead"] < 0).mean()), 4),
        "leader_conflict_rate": round(float(conflict.mean()), 4),
    }
    return obs, truth, info


def main():
    ap = argparse.ArgumentParser(description="가상 직원 데이터 생성")
    ap.add_argument("--scenario", choices=["A", "B"], default="A")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--n", type=int, default=9000)
    ap.add_argument("--sigma", type=float, default=1.0)
    ap.add_argument("--strength", type=float, default=None)
    ap.add_argument("--out", type=Path, default=DATA_DIR)
    a = ap.parse_args()

    obs, truth, info = generate(a.scenario, a.seed, a.n, a.sigma, a.strength)
    a.out.mkdir(parents=True, exist_ok=True)
    # 사람이 여는 CSV는 한글 열 이름·값으로, BOM 포함 UTF-8로 저장한다(엑셀 더블클릭 시 한글 깨짐 방지).
    # 코드 안에서는 영문 열 이름을 쓰고, 읽을 때 read_data()로 되돌린다. — 2026-11-16 사용자 요청
    to_ko(obs).to_csv(a.out / f"employees_{a.scenario}.csv", index=False, encoding="utf-8-sig", lineterminator="\n")
    to_ko(truth).to_csv(a.out / f"truth_{a.scenario}.csv", index=False, encoding="utf-8-sig", lineterminator="\n")
    (a.out / f"gen_info_{a.scenario}.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"시나리오 {a.scenario}: {a.n}명, 시드 {a.seed}, σ {a.sigma}, 궁합 강도 {info['strength']}, b0 {info['b0']}")
    print(f"  갈래별 퇴사율 {info['leave_rate']}, decided {info['decided_rate']}, 팀장 갈등 {info['leader_conflict_rate']}")
    print(f"  평균 진짜 효과 {info['mean_tau']}, 팀장 면담 역효과 비율 {info['negative_tau_lead_share']}")


if __name__ == "__main__":
    main()
