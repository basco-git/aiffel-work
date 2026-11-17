"""TabICL 1단계 비교 시도 (PRD T14, 인터뷰 Q11).

기존 1단계 모델과 같은 조건으로 채점한다.
- 분할: train_eval.py가 저장한 data/split.json (같은 훈련·시험 행)
- 대상: 대조군(talk_by = none)만, 입력 열은 train_eval.FEATURES (부서는 원-핫)
- 동점 처리: train_eval과 같은 난수 순서(seed + 1000의 첫 permutation)
- 지표: 훈련 5겹 CV AUC, 시험 AUC, 정확도, Brier(보정 전·후, isotonic 5겹), 포착률·리프트, 상위 20% 순이익

실행 환경: TabICL은 torch가 필요해 Python 3.13 별도 가상환경(ml/.venv-tabicl)에서 돌린다.
기존 결과(results/A, results/B)와 웹은 바꾸지 않고 results/tabicl_trial.json에만 쓴다.
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime
from importlib.metadata import version
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline

from generate_data import read_data
from train_eval import DATA, EXAMPLE, FEATURES, KST, RESULTS, capture_lift, prep, ranks, rnd

LOG = Path(__file__).resolve().parent / "run_log.txt"


def log(msg):
    line = f"{datetime.now(KST):%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def make_tabicl(seed, n_estimators):
    from tabicl import TabICLClassifier
    return Pipeline([("p", prep()), ("m", TabICLClassifier(n_estimators=n_estimators, random_state=seed,
                                                           device="cpu"))])


def main():
    ap = argparse.ArgumentParser(description="TabICL 1단계 비교 시도")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--n-estimators", type=int, default=8, help="TabICL 앙상블 수(패키지 기본값 8)")
    ap.add_argument("--top", type=int, default=20, help="순이익을 계산할 상위 k%%")
    a = ap.parse_args()
    t0 = time.time()
    seed = a.seed
    log(f"[시작] TabICL 1단계 비교 시도 (tabicl {version('tabicl')}, torch {version('torch')}, "
        f"Python {platform.python_version()}, n_estimators {a.n_estimators})")

    base = read_data(DATA / "employees_A.csv")
    split = json.loads((DATA / "split.json").read_text(encoding="utf-8"))
    assert split["seed"] == seed, "split.json의 시드가 다릅니다. run_all.ps1을 먼저 실행하세요."
    tr_idx, te_idx = np.array(split["train"]), np.array(split["test"])
    ctrl = (base["talk_by"] == "none").values
    tr1, te1 = tr_idx[ctrl[tr_idx]], te_idx[ctrl[te_idx]]
    X1tr, y1tr = base.loc[tr1, FEATURES], base.loc[tr1, "left"].values
    X1te, y1te = base.loc[te1, FEATURES], base.loc[te1, "left"].values
    n1 = len(te1)
    tb1 = np.random.default_rng(seed + 1000).permutation(n1)  # train_eval과 같은 동점 순서
    skf = StratifiedKFold(5, shuffle=True, random_state=seed)
    log(f"  훈련 대조군 {len(tr1)}명, 시험 대조군 {n1}명")

    t = time.time()
    cv_auc = cross_val_score(make_tabicl(seed, a.n_estimators), X1tr, y1tr, cv=skf, scoring="roc_auc").mean()
    log(f"  훈련 5겹 CV AUC {cv_auc:.6f} ({time.time() - t:.1f}초)")

    t = time.time()
    raw = make_tabicl(seed, a.n_estimators).fit(X1tr, y1tr)
    p_raw = raw.predict_proba(X1te)[:, 1]
    log(f"  보정 전 학습·예측 ({time.time() - t:.1f}초)")

    t = time.time()
    cal = CalibratedClassifierCV(make_tabicl(seed, a.n_estimators), method="isotonic", cv=5).fit(X1tr, y1tr)
    p_cal = cal.predict_proba(X1te)[:, 1]
    log(f"  보정(isotonic 5겹) ({time.time() - t:.1f}초)")

    rk = ranks(p_cal, tb1)
    cap, lift = capture_lift(rk, y1te)
    s = int(round(n1 * a.top / 100))
    found = int(y1te[rk < s].sum())
    net = found * EXAMPLE["r"] * EXAMPLE["C_replace"] - s * EXAMPLE["C_lead"]

    out = {
        "trial": "TabICL 1단계 비교 (PRD T14)",
        "run_at": datetime.now(KST).isoformat(timespec="seconds"),
        "env": {"python": platform.python_version(), "tabicl": version("tabicl"), "torch": version("torch"),
                "scikit-learn": version("scikit-learn"), "device": "cpu", "n_estimators": a.n_estimators},
        "same_as_train_eval": "data/split.json 분할, 대조군, FEATURES, 동점 순서, 보정 방식",
        "n_train": int(len(tr1)), "n_test": n1,
        "cv_auc": rnd(cv_auc), "auc": rnd(roc_auc_score(y1te, p_cal)), "auc_raw": rnd(roc_auc_score(y1te, p_raw)),
        "accuracy": rnd(accuracy_score(y1te, p_cal >= 0.5)),
        "brier_raw": rnd(brier_score_loss(y1te, p_raw)), "brier_cal": rnd(brier_score_loss(y1te, p_cal)),
        "capture": {k: rnd(v) for k, v in cap.items()}, "lift": {k: rnd(v) for k, v in lift.items()},
        "cost_top": {"k": a.top, "n": s, "found": found, "unneeded": s - found, "net": rnd(net)},
        "seconds": round(time.time() - t0, 1),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "tabicl_trial.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"  시험 AUC {out['auc']}, 정확도 {out['accuracy']}, Brier(보정 후) {out['brier_cal']}, "
        f"포착률@10 {out['capture']['10']}, @20 {out['capture']['20']}, 상위 {a.top}% 찾은 퇴사자 {found}명, "
        f"순이익 {net / 1e8:.2f}억")
    log(f"[완료] TabICL 1단계 비교 시도 ({out['seconds']}초) → results/tabicl_trial.json")


if __name__ == "__main__":
    main()
