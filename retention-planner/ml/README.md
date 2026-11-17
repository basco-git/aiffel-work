# ml — 데이터 생성·분석 파이프라인

모든 수치는 이 폴더의 코드로 만들어져 `results/`에 저장되고, 웹과 보고서는 그 파일만 읽습니다.

## 실행

```powershell
uv venv -p 3.15 .venv
uv pip install -p .venv -r requirements.txt
.\run_all.ps1                # 전체 (약 75초)
.\run_all.ps1 -Sensitivity   # 민감도 분석 포함 (약 4분)
.\run_all.ps1 -Seed 7 -N 3000  # 빠른 시험
```

- 기본 Python은 uv가 관리해서 `pip install`이 막혀 있습니다(`externally-managed-environment`). 반드시 uv 가상환경을 씁니다.
- `run_all.ps1`은 단계마다 시각과 결과를 `run_log.txt`에 남깁니다. 이 로그는 [분석 기록부](../docs/ANALYSIS_LOG.md)의 근거라서 커밋합니다.

## 파일

| 파일 | 하는 일 | 입력 → 출력 |
| --- | --- | --- |
| `run_all.ps1` | 환경 확인 → 생성(A·B) → 학습·평가 → (민감도) → 테스트 → `site/data` 복사 → 웹 계산 대조 | — |
| `generate_data.py` | 가상 직원 9,000명, 사유 5종, 시범 면담 3갈래, 숨은 `decided`, 시나리오 A·B. 상단에 **생성 계수 표** | → `data/employees_*.csv`, `truth_*.csv`, `gen_info_*.json` |
| `train_eval.py` | 분할(시험 30% 고정) → 1단계 위험 모델 6종(기준선 포함) + 확률 보정 → 2단계 업리프트 후보 3종 중 훈련 CV Qini로 선택 → 지표·공정성·중요도·보정 곡선 | `data/` → `results/A·B/*.json`, `meta.json`, `reference.json` |
| `allocate.py` | 웹 배분 규칙의 Python 참조 구현(무작위·위험 순·전문가 규칙·효과 순·상한) | 웹 대조용 기대값 생성 |
| `sensitivity.py` | 시범 인원 × 궁합 강도 × 시드 3개 | → `results/sensitivity.json` |
| `company_type.py` | 회사 유형(대기업형·기준·중소기업형) × 시나리오 A·B × 시드 3. 연봉·복지 만족만 옮긴 회사에서 같은 분석 반복(약 15초) | → `results/company_type.json` |
| `failure_cases.py` | 본 실행 결과와 진짜 값을 합쳐 실패 사례 유형별 건수와 대표 사례를 뽑음(임원 슬롯 낭비, 역효과 배정, 놓친 퇴사자, 효과 추정 빗나감) | `results/*/scores.json`, `data/` → `results/failure_cases.json` |
| `tabicl_trial.py` | TabICL 1단계 추가 비교(같은 분할·지표). torch가 필요해 **Python 3.13 별도 환경** `.venv-tabicl`에서 실행, `run_all.ps1`에는 넣지 않음(약 17분) | `data/split.json` → `results/tabicl_trial.json` |
| `tests/` | 생성 12개(재현성·범위·비율·A/B 동일성·한글 CSV·회사 유형 등) + 결과 9개(분할 겹침·지표 재계산·순위·배분 손계산·본 실행과 민감도의 일관성) | — |
| `run_log.txt` | 실행 기록(시각·수치) | — |

## 판단 원칙

- 시험 정답은 채점에만 씁니다. 모델 선택(1단계 대표 모델, 2단계 추정기)은 **훈련 자료 5겹 교차 검증**으로 합니다.
- 하이퍼파라미터는 미리 정한 값을 씁니다(시험 점수로 튜닝하지 않음).
- 동점 처리는 고정 시드 순번(`tiebreak`)으로 하고, 순위를 저장해 웹이 그대로 씁니다.
