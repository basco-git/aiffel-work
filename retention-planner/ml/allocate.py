"""웹 계산 규칙의 Python 참조 구현 (docs/DATA_CONTRACT.md "웹 계산 규칙").

웹(site/alloc.js)과 같은 결과가 나와야 한다. reference.json의 기대값을 여기서 만든다.
"""

from __future__ import annotations

import numpy as np


def order_desc(value, tiebreak):
    """value 내림차순, 동점은 tiebreak 오름차순인 행 번호 배열."""
    return np.lexsort((np.asarray(tiebreak), -np.asarray(value, dtype=float)))


def stage1(rank, left, prob, k, r, c_replace, c_lead):
    rank, left = np.asarray(rank), np.asarray(left)
    n = len(rank)
    s = int(round(n * k))
    sel = rank < s
    tp = int(left[sel].sum())
    out = {"S": s, "TP": tp, "unneeded": s - tp,
           "net": tp * r * c_replace - s * c_lead,
           "capture": tp / max(int(left.sum()), 1)}
    if prob is not None:
        prob = np.asarray(prob)
        sel2 = prob * r * c_replace > c_lead
        s2, tp2 = int(sel2.sum()), int(left[sel2].sum())
        out["threshold"] = {"S": s2, "TP": tp2, "net": tp2 * r * c_replace - s2 * c_lead}
    return out


def assign(method, d, m, k, c_replace, c_lead, c_exec):
    """방법별로 'exec' / 'lead' / '' 배정 배열을 돌려준다."""
    n = len(d["tiebreak"])
    L = int(round(n * k))
    if m + L > n:
        raise ValueError("m + L이 인원보다 많음")
    tb = np.asarray(d["tiebreak"])
    out = np.array([""] * n, dtype=object)
    if method in ("random", "risk"):
        score = -tb if method == "random" else np.asarray(d["risk"], dtype=float)
        order = order_desc(score, tb)
        out[order[:m]] = "exec"
        out[order[m:m + L]] = "lead"
        return out
    if method == "uplift":
        t_lead, t_exec = np.asarray(d["tau_hat_lead"]), np.asarray(d["tau_hat_exec"])
    elif method == "oracle":
        t_lead, t_exec = np.asarray(d["tau_lead"]), np.asarray(d["tau_exec"])
    else:
        raise ValueError(method)
    v_exec = t_exec * c_replace - c_exec
    v_lead = t_lead * c_replace - c_lead
    gain = v_exec - np.maximum(v_lead, 0)
    order = order_desc(gain, tb)
    ex = order[:m]
    out[ex] = "exec"
    rest_mask = np.ones(n, dtype=bool)
    rest_mask[ex] = False
    rest_idx = np.where(rest_mask)[0]
    lo = rest_idx[order_desc(v_lead[rest_idx], tb[rest_idx])][:L]
    out[lo] = "lead"
    return out


def stage2(method, d, m, k, c_replace, c_lead, c_exec):
    a = assign(method, d, m, k, c_replace, c_lead, c_exec)
    t_lead, t_exec = np.asarray(d["tau_lead"]), np.asarray(d["tau_exec"])
    is_e, is_l = a == "exec", a == "lead"
    saved = float(t_exec[is_e].sum() + t_lead[is_l].sum())
    m_, L = int(is_e.sum()), int(is_l.sum())
    return {"exec": m_, "lead": L, "saved": saved,
            "net": saved * c_replace - m_ * c_exec - L * c_lead,
            "backfire": int((is_l & (t_lead < 0)).sum()),
            "assign": a}
