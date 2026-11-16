# 데이터 약속 (ML → 웹)

ML(`ml/train_eval.py`)이 쓰고 웹(`site/`)이 읽는 JSON의 형식이에요. **양쪽이 이 문서만 보고 따로 작업할 수 있게** 정했어요. 바꿀 때는 이 문서를 먼저 고쳐요.

- 위치: `results/` → `run_all.ps1`이 `site/data/`로 통째로 복사
- 인코딩 UTF-8, 숫자는 소수 6자리 이하로 반올림, 없는 값은 `null`
- 개인 이름·`emp_id`는 넣지 않는다. 행은 배열 위치(0부터)로만 구분한다.

```
site/data/
├─ meta.json
├─ sensitivity.json        (P1, 없을 수 있음)
├─ reference.json          웹 계산 검증용 기대값
├─ A/  scores.json, metrics.json, calibration.json, importance.json, fairness.json
└─ B/  (같은 구성)
```

- 1단계(대조군 위험 예측)는 시나리오와 무관하게 같은 값이다(같은 직원·같은 추첨). 편의상 A·B 각각에 같은 내용을 둔다.
- `importance.json`, `fairness.json`, `calibration.json`, `sensitivity.json`은 P1이라 없을 수 있다. **웹은 파일이 없으면 해당 카드를 "준비 중"으로 숨긴다.**

---

## meta.json

```json
{
  "mock": false,
  "seed": 42,
  "n": 9000,
  "generated_at": "2026-11-17T14:00:00+09:00",
  "runtime_sec": 42.1,
  "versions": {"python": "3.15.1", "numpy": "2.5.5", "pandas": "3.1.1", "scikit-learn": "1.9.1"},
  "split": {"train": 6300, "test": 2700},
  "assignment": {"none": 0.4, "lead": 0.3, "exec": 0.3},
  "scenarios": {
    "A": {"leave_rate": {"none": 0.15, "lead": 0.11, "exec": 0.08}, "decided_rate": 0.0},
    "B": {"leave_rate": {"none": 0.15, "lead": 0.11, "exec": 0.08}, "decided_rate": 0.07}
  },
  "generation": {"sigma": 1.0, "b0": -2.1, "coefficients": {"sat_pay": -0.6}, "effect": {"A": {}, "B": {}}}
}
```

- `mock: true`이면 웹은 맨 위에 "견본 데이터로 그린 화면" 띠를 보인다.

## {A,B}/scores.json — 시험 행 단위 (열 방향 배열)

```json
{
  "scenario": "A",
  "stage1": {
    "n": 1080,
    "left": [0, 1, 0],
    "best": "hgb",
    "methods": [
      {"id": "random", "label": "무작위",          "kind": "baseline", "rank": [2, 0, 1], "prob": null},
      {"id": "tenure", "label": "근속 짧은 순",    "kind": "baseline", "rank": [0, 2, 1], "prob": null},
      {"id": "logit",  "label": "로지스틱 회귀",   "kind": "baseline", "rank": [1, 0, 2], "prob": [0.1, 0.4, 0.2]},
      {"id": "rf",     "label": "랜덤 포레스트",   "kind": "model",    "rank": [1, 0, 2], "prob": [0.1, 0.5, 0.2]},
      {"id": "hgb",    "label": "HistGradientBoosting", "kind": "model", "rank": [1, 0, 2], "prob": [0.1, 0.5, 0.2]}
    ]
  },
  "stage2": {
    "n": 2700,
    "talk_by": ["none", "lead", "exec"],
    "left": [0, 1, 0],
    "risk": [0.12, 0.40, 0.08],
    "tau_hat_lead": [0.01, 0.05, -0.02],
    "tau_hat_exec": [0.02, 0.12, 0.01],
    "tau_lead": [0.01, 0.06, -0.03],
    "tau_exec": [0.02, 0.10, 0.00],
    "tiebreak": [2, 0, 1],
    "leader_conflict": [0, 0, 1],
    "age_band": ["30세 미만", "30대", "40대"],
    "gender": ["남", "여", "남"]
  }
}
```

- `stage1.rank[i]`: i번째 행의 순위. **0 = 가장 위험**, 0~n−1의 중복 없는 순열. 동점은 Python이 고정 시드로 이미 깼다.
- `stage1.prob`: 보정 확률(모델·로지스틱만). 무작위·근속 기준선은 `null`.
- `stage1.methods`에 P1 모델 `gb`(그래디언트 부스팅)가 추가될 수 있다. 웹은 배열을 그대로 돌며 그린다.
- `stage2.risk`: 1단계 대표 모델(`best`)의 보정 위험 확률. 시험 전체 행에 대해 예측한 값이다.
- `tau_hat_*`: T-learner 추정 효과. `tau_*`: 진짜 효과(가상 데이터라서만 존재).
- `tiebreak`: 0~n−1 순열. 동점 처리와 무작위 방법에 쓴다(작을수록 먼저).
- `age_band` 값: `"30세 미만" | "30대" | "40대" | "50세 이상"`, `gender` 값: `"남" | "여"`

## 웹 계산 규칙 (PRD §7, §6.3을 코드 수준으로)

**1단계** — 입력 `k`(0~1), `r`, `C_replace`, `C_lead`

```
S  = round(n × k)
선정 = rank < S 인 행
TP = 선정 중 left = 1 인 수
불필요 면담 = S − TP
순이익 = TP × r × C_replace − S × C_lead
포착률 = TP / (left 합)
기대이익 문턱(prob 있는 방법만): 선정 = prob × r × C_replace > C_lead 인 행, 같은 식으로 순이익
```

**2단계** — 입력 `m`(임원 슬롯 수, 정수), `k`(팀장 비율), `C_replace`, `C_lead`, `C_exec`

```
L = round(n × k)
방법별 정렬과 배분:
  random : tiebreak 오름차순으로 앞 m명 → exec, 그다음 L명 → lead
  risk   : risk 내림차순(동점은 tiebreak 오름차순)으로 앞 m명 → exec, 그다음 L명 → lead
  uplift : τ = (tau_hat_lead, tau_hat_exec) 로 아래 "가치 배분"
  oracle : τ = (tau_lead, tau_exec)         로 아래 "가치 배분"

가치 배분:
  V_exec = τ_exec × C_replace − C_exec
  V_lead = τ_lead × C_replace − C_lead
  1) 임원: (V_exec − max(V_lead, 0)) 내림차순(동점 tiebreak 오름차순)으로 앞 m명
  2) 팀장: 남은 행 중 V_lead 내림차순(동점 tiebreak 오름차순)으로 앞 L명

채점(모든 방법 공통, 진짜 효과 사용):
  막은 퇴사 = Σ(exec 배정자의 tau_exec) + Σ(lead 배정자의 tau_lead)
  순이익    = 막은 퇴사 × C_replace − m × C_exec − L × C_lead
  역효과 배정 = lead 배정자 중 tau_lead < 0 인 수
  상한 대비 % = 순이익 / oracle 순이익 × 100 (oracle 순이익 ≤ 0 이면 "—")
```

- `m + L > n`이면 입력 오류로 안내한다.
- 이 규칙은 Python(`ml/allocate.py`)과 JS(`site/alloc.js`)에 **각각 구현하고 `reference.json`으로 대조**한다.

## reference.json — 웹 계산 검증용 기대값

```json
{
  "cases": [
    {
      "scenario": "B",
      "inputs": {"k": 0.2, "m": 135, "r": 0.3, "C_replace": 30000000, "C_lead": 300000, "C_exec": 1500000},
      "stage1": {"hgb": {"S": 216, "TP": 80, "net": 123}},
      "stage2": {"uplift": {"exec": 135, "lead": 540, "saved": 61.2, "net": 456, "backfire": 3}}
    }
  ]
}
```

- `site/alloc.test.mjs`(Node)가 이 파일을 읽어 JS 계산 결과와 소수 2자리까지 일치하는지 확인한다.

## {A,B}/metrics.json

```json
{
  "scenario": "A",
  "stage1": {
    "n_test": 1080, "leave_rate": 0.15, "all_stay_accuracy": 0.85,
    "methods": [
      {"id": "hgb", "label": "HistGradientBoosting", "accuracy": 0.86, "auc": 0.78,
       "brier_raw": 0.11, "brier_cal": 0.10,
       "capture": {"5": 0.2, "10": 0.35, "20": 0.55, "30": 0.7},
       "lift": {"5": 4.0, "10": 3.5, "20": 2.75, "30": 2.3},
       "cv_auc": 0.77}
    ]
  },
  "stage2": {
    "n_test": 2700, "arms": {"none": 1080, "lead": 810, "exec": 810},
    "methods": [
      {"id": "random", "label": "무작위",            "qini_lead": 0.0, "qini_exec": 0.0, "corr_lead": null, "corr_exec": null},
      {"id": "risk",   "label": "위험 순",           "qini_lead": 0.01, "qini_exec": 0.02, "corr_lead": 0.3, "corr_exec": 0.3},
      {"id": "uplift", "label": "효과 순(T-learner)", "qini_lead": 0.02, "qini_exec": 0.05, "corr_lead": 0.4, "corr_exec": 0.5},
      {"id": "oracle", "label": "진짜 효과 순(상한)", "qini_lead": 0.03, "qini_exec": 0.07, "corr_lead": 1.0, "corr_exec": 1.0}
    ],
    "qini_curves": {
      "uplift": {"lead": [[0, 0], [0.1, 3.2]], "exec": [[0, 0], [0.1, 5.0]]},
      "risk":   {"lead": [[0, 0]], "exec": [[0, 0]]},
      "random": {"lead": [[0, 0], [1, 10]], "exec": [[0, 0], [1, 20]]}
    }
  }
}
```

- 점수가 없는 기준선(`random`, `tenure`)은 `accuracy`, `brier_*`가 `null`.
- `corr_*`: 스피어만 순위 상관(점수 vs 진짜 효과). `risk`는 위험 확률과 진짜 효과의 상관.
- `qini_curves`: x = 대상 비율(0~1), y = 누적으로 막은 퇴사 수(관측 기반). 21개 점(0, 0.05, …, 1).

## {A,B}/calibration.json (P1)

```json
{"model": "hgb",
 "raw": [{"mean_pred": 0.05, "frac_pos": 0.04, "count": 300}],
 "cal": [{"mean_pred": 0.05, "frac_pos": 0.05, "count": 310}]}
```

## {A,B}/importance.json (P1)

```json
{"risk":        [{"feature": "leader_conflict", "label": "팀장 등 갈등", "mean": 0.05, "std": 0.01}],
 "uplift_exec": [{"feature": "sat_pay",         "label": "연봉 만족",    "mean": 0.02, "std": 0.005}]}
```

- 큰 순으로 정렬. `label`은 화면 표시용 한국어.

## {A,B}/fairness.json (P1, 보고서용 — 웹은 scores.json으로 직접 계산해도 됨)

```json
{"inputs": {"k": 0.2, "m": 135, "C_replace": 30000000, "C_lead": 300000, "C_exec": 1500000},
 "groups": [
   {"group": "30세 미만", "type": "age", "share": 0.2,
    "risk":   {"exec_rate": 0.08, "lead_rate": 0.25, "capture": 0.4},
    "uplift": {"exec_rate": 0.05, "lead_rate": 0.22}}
 ]}
```

## sensitivity.json (P1)

```json
{"sigma": [0.5, 1.0, 1.5], "strength": [0, 0.5, 1.0],
 "inputs": {"k": 0.2, "m": 135, "C_replace": 30000000, "C_lead": 300000, "C_exec": 1500000},
 "cells": [{"sigma": 0.5, "strength": 0, "net_uplift": 1.0, "net_risk": 1.0, "benefit_ratio": 1.0, "corr_exec": 0.2}]}
```

- `benefit_ratio` = 효과 순 순이익 ÷ 위험 순 순이익 (위험 순 순이익 ≤ 0 이면 `null`).
