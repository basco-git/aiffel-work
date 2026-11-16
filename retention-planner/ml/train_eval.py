"""분할 → 1단계(위험 예측)·2단계(업리프트) 학습 → 점수·지표 저장 (PRD §6).

형식은 docs/DATA_CONTRACT.md를 따른다. 시험 정답은 채점에만 쓰고,
모델 선택·보정은 훈련 자료 안의 교차 검증으로 한다. 하이퍼파라미터는 미리 고정한 값이다.
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from scipy.stats import spearmanr
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import allocate

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
KST = timezone(timedelta(hours=9))

NUMERIC = ["job_level", "tenure_years", "years_since_promotion", "monthly_income_rank",
           "overtime_hours_month", "commute_minutes", "training_hours_year",
           "sat_pay", "sat_job_fit", "sat_benefits", "leader_conflict", "sat_direction"]
CATEG = ["department"]
FEATURES = NUMERIC + CATEG
LABELS = {
    "job_level": "직급", "tenure_years": "근속 연수", "years_since_promotion": "승진 후 기간",
    "monthly_income_rank": "급여 상대 수준", "overtime_hours_month": "월 야근 시간",
    "commute_minutes": "통근 시간", "training_hours_year": "연 교육 시간",
    "sat_pay": "연봉 만족", "sat_job_fit": "원하는 업무", "sat_benefits": "복지·보상 만족",
    "leader_conflict": "팀장 등 갈등", "sat_direction": "회사 방향·성장 신뢰", "department": "부서",
}
KS = [5, 10, 20, 30]
EXAMPLE = {"r": 0.3, "C_replace": 30_000_000, "C_lead": 300_000, "C_exec": 1_500_000}


def rnd(x, nd=6):
    if x is None:
        return None
    if isinstance(x, (list, tuple, np.ndarray)):
        return [rnd(v, nd) for v in x]
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return None if np.isnan(x) else round(float(x), nd)
    return x


def prep(scale=False):
    num = StandardScaler() if scale else "passthrough"
    return ColumnTransformer([("num", num, NUMERIC),
                              ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEG)])


def make_models(seed):
    return {
        "logit": ("로지스틱 회귀", "baseline",
                  Pipeline([("p", prep(True)), ("m", LogisticRegression(max_iter=2000))])),
        "rf": ("랜덤 포레스트", "model",
               Pipeline([("p", prep()), ("m", RandomForestClassifier(n_estimators=300, min_samples_leaf=5,
                                                                    n_jobs=-1, random_state=seed))])),
        "hgb": ("HistGradientBoosting", "model",
                Pipeline([("p", prep()), ("m", HistGradientBoostingClassifier(random_state=seed))])),
        "gb": ("그래디언트 부스팅", "model",
               Pipeline([("p", prep()), ("m", GradientBoostingClassifier(random_state=seed))])),
    }


def uplift_hgb(seed):
    # T-learner 갈래별 모델. 효과(확률 차)가 작아 과적합을 줄이도록 미리 정한 규제값.
    return Pipeline([("p", prep()), ("m", HistGradientBoostingClassifier(
        max_iter=200, learning_rate=0.05, min_samples_leaf=40, l2_regularization=1.0, random_state=seed))])


def uplift_logit(seed):
    return Pipeline([("p", prep(True)), ("m", LogisticRegression(max_iter=3000))])


class TLearner:
    """처치 갈래(none·lead·exec)마다 모델을 따로 학습해 확률 차로 효과를 추정."""

    def __init__(self, make, seed):
        self.make, self.seed = make, seed

    def fit(self, X, talk, y):
        self.models = {arm: self.make(self.seed).fit(X[talk == arm], y[talk == arm]) for arm in ("none", "lead", "exec")}
        return self

    def tau(self, X):
        p = {arm: m.predict_proba(X)[:, 1] for arm, m in self.models.items()}
        return {"lead": p["none"] - p["lead"], "exec": p["none"] - p["exec"]}


class SLogit:
    """모델 하나에 처치 더미와 (입력 × 처치) 상호작용을 넣은 로지스틱 S-learner."""

    def __init__(self, seed):
        self.seed = seed

    def _z(self, Xs, arm):
        n = Xs.shape[0]
        dl = np.full((n, 1), 1.0 if arm == "lead" else 0.0)
        de = np.full((n, 1), 1.0 if arm == "exec" else 0.0)
        return np.hstack([Xs, dl, de, Xs * dl, Xs * de])

    def fit(self, X, talk, y):
        self.p = prep(True).fit(X)
        Xs = self.p.transform(X)
        Z = np.vstack([self._z(Xs[talk == arm], arm) for arm in ("none", "lead", "exec")])
        yy = np.concatenate([y[talk == arm] for arm in ("none", "lead", "exec")])
        self.m = LogisticRegression(max_iter=3000).fit(Z, yy)
        return self

    def tau(self, X):
        Xs = self.p.transform(X)
        p = {arm: self.m.predict_proba(self._z(Xs, arm))[:, 1] for arm in ("none", "lead", "exec")}
        return {"lead": p["none"] - p["lead"], "exec": p["none"] - p["exec"]}


UPLIFT_CANDIDATES = {
    "t_hgb": ("T-learner(HistGB)", lambda s: TLearner(uplift_hgb, s)),
    "t_logit": ("T-learner(로지스틱)", lambda s: TLearner(uplift_logit, s)),
    "s_logit": ("S-learner(로지스틱+상호작용)", lambda s: SLogit(s)),
}


def ranks(score, tiebreak):
    order = allocate.order_desc(score, tiebreak)
    r = np.empty(len(order), dtype=int)
    r[order] = np.arange(len(order))
    return r


def capture_lift(rank, y):
    n, pos = len(y), y.sum()
    cap, lift = {}, {}
    for k in KS:
        s = int(round(n * k / 100))
        tp = y[rank < s].sum()
        cap[str(k)] = tp / pos
        lift[str(k)] = (tp / s) / (pos / n) if s else None
    return cap, lift


def qini(score, tiebreak, arm_mask, ctrl_mask, retained):
    """관측 기반 Qini 곡선(21점)과 계수. 결과는 '남음(1-left)' 기준."""
    idx = np.where(arm_mask | ctrl_mask)[0]
    order = idx[allocate.order_desc(np.asarray(score)[idx], np.asarray(tiebreak)[idx])]
    t = arm_mask[order].astype(float)
    c = ctrl_mask[order].astype(float)
    y = retained[order].astype(float)
    nt, nc = np.cumsum(t), np.cumsum(c)
    rt, rc = np.cumsum(y * t), np.cumsum(y * c)
    with np.errstate(divide="ignore", invalid="ignore"):
        q = np.where(nc > 0, rt - rc * nt / np.maximum(nc, 1), 0.0)
    q = np.concatenate([[0.0], q])
    xs = np.arange(len(q)) / (len(q) - 1)
    rand = xs * q[-1]
    coef = float(np.trapezoid(q - rand, xs) / len(idx))
    pts = [[round(x, 2), float(np.interp(x, xs, q))] for x in np.linspace(0, 1, 21)]
    return coef, pts


def age_band(a):
    return np.select([a < 30, a < 40, a < 50], ["30세 미만", "30대", "40대"], "50세 이상")


def main():
    ap = argparse.ArgumentParser(description="학습·평가")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=RESULTS)
    ap.add_argument("--no-p1", action="store_true", help="P1 산출물(중요도·공정성·보정 곡선) 생략")
    a = ap.parse_args()
    t0 = time.time()
    seed = a.seed
    rng = np.random.default_rng(seed + 1000)

    obs = {sc: pd.read_csv(DATA / f"employees_{sc}.csv") for sc in "AB"}
    truth = {sc: pd.read_csv(DATA / f"truth_{sc}.csv") for sc in "AB"}
    gen = {sc: json.loads((DATA / f"gen_info_{sc}.json").read_text(encoding="utf-8")) for sc in "AB"}
    base = obs["A"]
    n = len(base)

    # ---- 분할: A 기준 층화(talk_by × left), A·B 같은 행을 쓴다 ----
    strata = base["talk_by"] + "_" + base["left"].astype(str)
    tr_idx, te_idx = train_test_split(np.arange(n), test_size=0.3, stratify=strata, random_state=seed)
    tr_idx, te_idx = np.sort(tr_idx), np.sort(te_idx)
    assert not set(tr_idx) & set(te_idx)
    # 분할 기록 (테스트용, 행 번호만 — site로 복사되지 않는 data/에 둔다)
    (DATA / "split.json").write_text(json.dumps({"seed": seed, "train": tr_idx.tolist(), "test": te_idx.tolist()}),
                                     encoding="utf-8")

    # ---- 1단계: 대조군 위험 예측 (A·B 동일) ----
    ctrl = (base["talk_by"] == "none").values
    tr1, te1 = tr_idx[ctrl[tr_idx]], te_idx[ctrl[te_idx]]
    X1tr, y1tr = base.loc[tr1, FEATURES], base.loc[tr1, "left"].values
    X1te, y1te = base.loc[te1, FEATURES], base.loc[te1, "left"].values
    n1 = len(te1)
    tb1 = rng.permutation(n1)
    skf = StratifiedKFold(5, shuffle=True, random_state=seed)

    s1_methods, s1_metrics, fitted = [], [], {}
    rand_score = -tb1.astype(float)
    ten_score = -base.loc[te1, "tenure_years"].values
    for mid, label, score in [("random", "무작위", rand_score), ("tenure", "근속 짧은 순", ten_score)]:
        rk = ranks(score, tb1)
        cap, lift = capture_lift(rk, y1te)
        s1_methods.append({"id": mid, "label": label, "kind": "baseline", "rank": rk.tolist(), "prob": None})
        s1_metrics.append({"id": mid, "label": label, "accuracy": None, "auc": roc_auc_score(y1te, score),
                           "brier_raw": None, "brier_cal": None, "capture": cap, "lift": lift, "cv_auc": None})

    for mid, (label, kind, pipe) in make_models(seed).items():
        cv_auc = cross_val_score(pipe, X1tr, y1tr, cv=skf, scoring="roc_auc").mean()
        raw = pipe.fit(X1tr, y1tr)
        p_raw = raw.predict_proba(X1te)[:, 1]
        cal = CalibratedClassifierCV(make_models(seed)[mid][2], method="isotonic", cv=5).fit(X1tr, y1tr)
        p_cal = cal.predict_proba(X1te)[:, 1]
        fitted[mid] = {"raw": raw, "cal": cal, "p_raw": p_raw, "p_cal": p_cal}
        rk = ranks(p_cal, tb1)
        cap, lift = capture_lift(rk, y1te)
        s1_methods.append({"id": mid, "label": label, "kind": kind, "rank": rk.tolist(), "prob": rnd(p_cal)})
        s1_metrics.append({"id": mid, "label": label, "accuracy": accuracy_score(y1te, p_cal >= 0.5),
                           "auc": roc_auc_score(y1te, p_cal), "brier_raw": brier_score_loss(y1te, p_raw),
                           "brier_cal": brier_score_loss(y1te, p_cal), "capture": cap, "lift": lift,
                           "cv_auc": cv_auc})
        print(f"  1단계 {label}: 훈련 CV AUC {cv_auc:.3f}, 시험 AUC {roc_auc_score(y1te, p_cal):.3f}")
    best = max(fitted, key=lambda m: next(x["cv_auc"] for x in s1_metrics if x["id"] == m))
    print(f"  1단계 대표 모델(훈련 CV 기준): {best}")
    for x in s1_metrics:
        x.update({k: rnd(v) for k, v in x.items() if isinstance(v, (float, np.floating))})
        x["capture"] = {k: rnd(v) for k, v in x["capture"].items()}
        x["lift"] = {k: rnd(v) for k, v in x["lift"].items()}

    stage1_scores = {"n": n1, "left": y1te.tolist(), "best": best, "methods": s1_methods}
    stage1_metrics = {"n_test": n1, "leave_rate": rnd(y1te.mean()),
                      "all_stay_accuracy": rnd(1 - y1te.mean()), "methods": s1_metrics}

    # ---- 2단계 준비: 시험 전체 행 ----
    n2 = len(te_idx)
    tb2 = rng.permutation(n2)
    risk2 = fitted[best]["cal"].predict_proba(base.loc[te_idx, FEATURES])[:, 1]
    m_default = int(round(0.05 * n2))
    ref_cases = []
    out_root = a.out
    out_root.mkdir(parents=True, exist_ok=True)
    scen_meta = {}

    for sc in "AB":
        df, tr = obs[sc], truth[sc]
        talk = df["talk_by"].values
        # 업리프트 방법 선택: 훈련 자료 5겹 교차 검증의 관측 Qini(팀장·임원 평균)로만 고른다
        Xtr, ytr, talk_tr = df.loc[tr_idx, FEATURES], df.loc[tr_idx, "left"].values, talk[tr_idx]
        cv_strata = talk_tr + "_" + ytr.astype(str)
        skf2 = StratifiedKFold(5, shuffle=True, random_state=seed)
        cv_qini = {}
        for cid, (clabel, make) in UPLIFT_CANDIDATES.items():
            vals = []
            for f_tr, f_va in skf2.split(Xtr, cv_strata):
                lr = make(seed).fit(Xtr.iloc[f_tr], talk_tr[f_tr], ytr[f_tr])
                th = lr.tau(Xtr.iloc[f_va])
                tbv = np.arange(len(f_va))
                ret = 1 - ytr[f_va]
                q = [qini(th[arm], tbv, talk_tr[f_va] == arm, talk_tr[f_va] == "none", ret)[0] for arm in ("lead", "exec")]
                vals.append(np.mean(q))
            cv_qini[cid] = float(np.mean(vals))
            print(f"  2단계 {sc} 후보 {clabel}: 훈련 CV Qini {cv_qini[cid]:.5f}")
        chosen = max(cv_qini, key=cv_qini.get)
        print(f"  2단계 {sc} 선택: {UPLIFT_CANDIDATES[chosen][0]}")
        learner = UPLIFT_CANDIDATES[chosen][1](seed).fit(Xtr, talk_tr, ytr)
        Xte = df.loc[te_idx, FEATURES]
        tau_hat = learner.tau(Xte)

        talk_te = talk[te_idx]
        left_te = df.loc[te_idx, "left"].values
        tau = {arm: tr.loc[te_idx, f"tau_{arm}"].values for arm in ("lead", "exec")}
        ages = df.loc[te_idx, "age"].values

        d2 = {
            "n": n2, "talk_by": talk_te.tolist(), "left": left_te.tolist(), "risk": rnd(risk2),
            "tau_hat_lead": rnd(tau_hat["lead"]), "tau_hat_exec": rnd(tau_hat["exec"]),
            "tau_lead": rnd(tau["lead"]), "tau_exec": rnd(tau["exec"]),
            "tiebreak": tb2.tolist(), "leader_conflict": df.loc[te_idx, "leader_conflict"].tolist(),
            "age_band": age_band(ages).tolist(), "gender": df.loc[te_idx, "gender"].tolist(),
        }
        # 웹과 같은 값으로 계산하도록 반올림된 값을 그대로 쓴다
        d2np = {k: np.asarray(v) if isinstance(v, list) else v for k, v in d2.items()}

        # Qini·상관
        retained = 1 - left_te
        ctrl_m = talk_te == "none"
        scores = {"random": -tb2.astype(float), "risk": risk2,
                  "uplift": tau_hat, "oracle": tau}
        labels = {"random": "무작위", "risk": "위험 순", "uplift": f"효과 순({UPLIFT_CANDIDATES[chosen][0]})",
                  "oracle": "진짜 효과 순(상한)"}
        s2_methods, curves = [], {}
        for mid in ("random", "risk", "uplift", "oracle"):
            row = {"id": mid, "label": labels[mid]}
            curves[mid] = {}
            for arm in ("lead", "exec"):
                sc_arm = scores[mid][arm] if isinstance(scores[mid], dict) else scores[mid]
                coef, pts = qini(sc_arm, tb2, talk_te == arm, ctrl_m, retained)
                row[f"qini_{arm}"] = rnd(coef)
                curves[mid][arm] = [[p[0], rnd(p[1], 3)] for p in pts]
                row[f"corr_{arm}"] = None if mid == "random" else rnd(spearmanr(sc_arm, tau[arm]).statistic)
            s2_methods.append(row)
            print(f"  2단계 {sc} {labels[mid]}: Qini 팀장 {row['qini_lead']}, 임원 {row['qini_exec']}, "
                  f"진짜 효과 상관 팀장 {row['corr_lead']}, 임원 {row['corr_exec']}")

        metrics = {"scenario": sc, "stage1": stage1_metrics,
                   "stage2": {"n_test": n2, "arms": {k: int((talk_te == k).sum()) for k in ("none", "lead", "exec")},
                              "methods": s2_methods, "qini_curves": curves}}
        scores_json = {"scenario": sc, "stage1": stage1_scores, "stage2": d2}

        # 기준 사례 (웹 대조용)
        for k, m in [(0.2, m_default), (0.1, 50)]:
            inp = {"k": k, "m": m, **EXAMPLE}
            c1 = {}
            for meth in s1_methods:
                res = allocate.stage1(meth["rank"], y1te, meth["prob"], k, EXAMPLE["r"], EXAMPLE["C_replace"], EXAMPLE["C_lead"])
                c1[meth["id"]] = {kk: rnd(v) for kk, v in res.items() if kk != "threshold"}
                if "threshold" in res:
                    c1[meth["id"]]["threshold"] = {kk: rnd(v) for kk, v in res["threshold"].items()}
            c2 = {}
            for mid in ("random", "risk", "uplift", "oracle"):
                res = allocate.stage2(mid, d2np, m, k, EXAMPLE["C_replace"], EXAMPLE["C_lead"], EXAMPLE["C_exec"])
                c2[mid] = {kk: rnd(v) for kk, v in res.items() if kk != "assign"}
            ref_cases.append({"scenario": sc, "inputs": inp, "stage1": c1, "stage2": c2})
            if k == 0.2:
                print(f"  2단계 {sc} 예시 순이익(만 원, k 20%, m {m}): " + ", ".join(
                    f"{labels[x]} {c2[x]['net'] / 1e4:,.0f}" for x in c2))

        sc_dir = out_root / sc
        sc_dir.mkdir(exist_ok=True)
        (sc_dir / "scores.json").write_text(json.dumps(scores_json, ensure_ascii=False), encoding="utf-8")
        (sc_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")

        # ---- P1 ----
        if not a.no_p1:
            # 보정 곡선 (대표 모델, 대조군 시험)
            def curve(p):
                fp, mp = calibration_curve(y1te, p, n_bins=10, strategy="uniform")
                bins = np.clip((p * 10).astype(int), 0, 9)
                cnt = [int(c) for c in np.bincount(bins, minlength=10) if c > 0]
                return [{"mean_pred": rnd(x), "frac_pos": rnd(y), "count": c} for x, y, c in zip(mp, fp, cnt)]
            calib = {"model": best, "raw": curve(fitted[best]["p_raw"]), "cal": curve(fitted[best]["p_cal"])}
            (sc_dir / "calibration.json").write_text(json.dumps(calib, ensure_ascii=False), encoding="utf-8")

            # 순열 중요도: 위험은 AUC 하락(정답 사용, 보고용), 효과는 τ̂_exec 변화량(정답 불필요)
            imp_rng = np.random.default_rng(seed + 2000)
            risk_model = fitted[best]["cal"]
            base_auc = roc_auc_score(y1te, risk_model.predict_proba(X1te)[:, 1])
            base_tau = tau_hat["exec"]
            imp_risk, imp_up = [], []
            for f in FEATURES:
                drops, shifts = [], []
                for _ in range(5):
                    Xp = X1te.copy()
                    Xp[f] = imp_rng.permutation(Xp[f].values)
                    drops.append(base_auc - roc_auc_score(y1te, risk_model.predict_proba(Xp)[:, 1]))
                    Xq = Xte.copy()
                    Xq[f] = imp_rng.permutation(Xq[f].values)
                    tq = learner.tau(Xq)["exec"]
                    shifts.append(np.mean(np.abs(tq - base_tau)))
                imp_risk.append({"feature": f, "label": LABELS[f], "mean": rnd(np.mean(drops)), "std": rnd(np.std(drops))})
                imp_up.append({"feature": f, "label": LABELS[f], "mean": rnd(np.mean(shifts)), "std": rnd(np.std(shifts))})
            imp = {"risk": sorted(imp_risk, key=lambda x: -x["mean"]),
                   "uplift_exec": sorted(imp_up, key=lambda x: -x["mean"]),
                   "note": "risk: 시험 대조군 AUC 하락량, uplift_exec: 임원 면담 추정 효과의 평균 변화량(정답 미사용)"}
            (sc_dir / "importance.json").write_text(json.dumps(imp, ensure_ascii=False, indent=1), encoding="utf-8")

            # 공정성 (기본 입력 k 20%, m 5%)
            asg = {mid: allocate.assign(mid, d2np, m_default, 0.2, EXAMPLE["C_replace"], EXAMPLE["C_lead"], EXAMPLE["C_exec"])
                   for mid in ("risk", "uplift")}
            bands = d2np["age_band"]
            gender = d2np["gender"]
            groups = []
            for gtype, gname, mask in ([("age", b, bands == b) for b in ["30세 미만", "30대", "40대", "50세 이상"]]
                                       + [("gender", g, gender == g) for g in ["남", "여"]]):
                row = {"group": gname, "type": gtype, "share": rnd(mask.mean())}
                for mid in ("risk", "uplift"):
                    asn = asg[mid][mask]
                    row[mid] = {"exec_rate": rnd((asn == "exec").mean()), "lead_rate": rnd((asn == "lead").mean())}
                lv = mask & (left_te == 1)
                row["risk"]["capture"] = rnd((asg["risk"][lv] != "").mean()) if lv.any() else None
                groups.append(row)
            fair = {"inputs": {"k": 0.2, "m": m_default, **{k: v for k, v in EXAMPLE.items() if k != "r"}},
                    "groups": groups, "note": "포착률은 시험 자료의 관측 퇴사자 기준"}
            (sc_dir / "fairness.json").write_text(json.dumps(fair, ensure_ascii=False, indent=1), encoding="utf-8")

        metrics["stage2"]["uplift_selection"] = {
            "chosen": chosen, "label": UPLIFT_CANDIDATES[chosen][0],
            "cv_qini": {k: rnd(v) for k, v in cv_qini.items()},
            "labels": {k: v[0] for k, v in UPLIFT_CANDIDATES.items()},
            "rule": "훈련 자료 5겹 교차 검증의 관측 Qini(팀장·임원 평균) 최대"}
        (sc_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")
        scen_meta[sc] = {"leave_rate": gen[sc]["leave_rate"], "decided_rate": gen[sc]["decided_rate"],
                         "uplift_method": chosen,
                         "mean_tau": gen[sc]["mean_tau"], "negative_tau_lead_share": gen[sc]["negative_tau_lead_share"]}

    (out_root / "reference.json").write_text(json.dumps({"cases": ref_cases}, ensure_ascii=False, indent=1), encoding="utf-8")
    meta = {
        "mock": False, "seed": seed, "n": n,
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "runtime_sec": round(time.time() - t0, 1),
        "versions": {"python": platform.python_version(), "numpy": np.__version__,
                     "pandas": pd.__version__, "scikit-learn": sklearn.__version__},
        "split": {"train": len(tr_idx), "test": len(te_idx), "stage1_test": n1, "stage2_test": n2},
        "assignment": {"none": 0.4, "lead": 0.3, "exec": 0.3},
        "best_stage1_model": best,
        "default_inputs": {"k": 0.2, "m": m_default, **EXAMPLE},
        "scenarios": scen_meta,
        "generation": {"sigma": gen["A"]["sigma"], "b0": gen["A"]["b0"], "target_leave_rate": gen["A"]["target_leave_rate"],
                       "coefficients": gen["A"]["coefficients"], "effect": gen["A"]["effect"],
                       "strength": {"A": gen["A"]["strength"], "B": gen["B"]["strength"]}},
    }
    (out_root / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  저장: {out_root} ({meta['runtime_sec']}초)")


if __name__ == "__main__":
    main()
