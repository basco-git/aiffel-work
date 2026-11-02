# 발동 시험: 다른 대화에서 한마디로

스킬을 만든 대화가 아닌 **새 Claude Code 세션**을 열고, 스킬 이름을 말하지 않고 평소처럼 한마디만 했을 때 스킬이 불리는지 확인했습니다.

## 방법

- 일시: 2026-11-02 17:02~17:03
- 위치: 저장소 맨 위 `aiffel-work` 폴더
- 명령: `claude -p "<한마디>" --output-format stream-json --verbose --max-turns 4`
- 안전장치: 파일을 바꾸지 않도록 쓰기 도구(Edit, Write)는 막고 읽기 도구만 허용했습니다. 시험 목적은 "발동하는가"이므로 최대 4턴에서 멈추게 했습니다.
- 판정: 세션 기록(JSON)에서 첫 도구 호출이 `Skill`이고 그 이름이 기대한 스킬인지 확인했습니다.

## 결과

| # | 새 세션에 한 말 (스킬 이름 없음) | 기대한 스킬 | 실제로 불린 스킬 | 판정 |
|---|---|---|---|---|
| 1 | "todo 과제 깃허브에 올리기 전에 빠진 거 없나 점검해 줘" | submit-check | `Skill: submit-check` (첫 도구 호출) | 발동 |
| 2 | "todo 앱 터미널 명령 결과로 확인 장면 캡처 하나 만들어 줘" | evidence-capture | `Skill: evidence-capture` (첫 도구 호출) | 발동 |
| 3 | "my-cargame 과제 정리해 줘" | assignment-wrapup | `Skill: assignment-wrapup` (첫 도구 호출) | 발동 |

- 세 세션 모두 시작할 때 스킬 목록에 세 스킬이 올라와 있었습니다.
- 발동 뒤에는 각 스킬의 절차대로 움직였습니다. 1은 점검 스크립트를 찾았고, 2는 템플릿을 읽고 실제 명령을 실행했고, 3은 git 기록과 기존 README부터 모았습니다.
- 턴 제한(4)에 걸려 끝까지 진행하지는 않았습니다. 시험 뒤 `git status`로 파일이 바뀌지 않은 것을 확인했습니다. 2번 세션은 읽기 전용 명령 `todo.bat summary`를 한 번 실행했습니다.

이 1차 시험 때는 스킬이 저장소 맨 위 `.claude/skills/`에 있었고, 하위 과제 폴더(`todo`)에서 연 세션의 스킬 목록에도 올라오는 것을 확인했습니다.

## 2차 시험: 설치 후 저장소 밖에서

스킬 원본을 맨 위 `skills/` 폴더로 옮기고 `python -I skills/install.py`로 개인 스킬 폴더(`~/.claude/skills/`)에 설치한 뒤, **`aiffel-work` 저장소 밖** 폴더에서 새 세션을 열어 다시 시험했습니다.

- 일시: 2026-11-02 17:13~17:14
- 위치: `C:\Users\82109\Documents\aiffel_AIagent` (저장소의 상위 폴더)
- 안전장치: 1차와 같음. 개인 훅(알림)은 꺼서 시험 세션이 알림을 띄우지 않게 함. 최대 3턴.

| # | 새 세션에 한 말 (스킬 이름 없음) | 기대한 스킬 | 실제로 불린 스킬 | 판정 |
|---|---|---|---|---|
| 1 | "aiffel-work 저장소에 skills 올리기 전에 빠진 거 없나 봐 줘" | submit-check | `Skill: submit-check` (첫 도구 호출) | 발동 |
| 2 | "aiffel-work/todo 터미널 명령 결과로 확인 장면 하나 만들어 줘" | evidence-capture | `Skill: evidence-capture` (첫 도구 호출) | 발동 |
| 3 | "aiffel-work의 my-game 과제 README 정리해 줘" | assignment-wrapup | `Skill: assignment-wrapup` (첫 도구 호출) | 발동 |

- 1차와 다른 말투("봐 줘", "하나 만들어 줘", "README 정리해 줘")로 요청해도 같은 스킬이 불렸습니다.
- 시험 뒤 `git status`로 파일이 바뀌지 않은 것을 확인했습니다. 비용은 세 세션 합쳐 약 0.56달러였습니다.
