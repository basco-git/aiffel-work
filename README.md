# AIFFEL 에이전트 과정 과제 제출

| # | 프로젝트 | 요약 | 실행 | 과제 |
|---|---|---|---|---|
| 1 | my-blog | 아이펠에서 배운 것을 기록하는 블로그 'AI 도전 일지' | [보기](https://basco-git.github.io/my-blog/) | [저장소](https://github.com/basco-git/my-blog) |
| 2 | my-domain | 나의 도메인(HR 15년 차) 분석: 성과관리 제도 개편 설계 프롬프트 | - | [저장소](https://github.com/basco-git/my-domain) |
| 3 | my-cargame | Sky Drive 3D: 하늘을 나는 자동차 게임 | [플레이](https://basco-git.github.io/aiffel-work/my-cargame/) | [폴더](my-cargame/) |
| 4 | my-game | 햄스터 서바이벌: 오염된 도시에서 몬스터를 사냥하는 햄스터 RPG | [플레이](https://basco-git.github.io/aiffel-work/my-game/) | [폴더](my-game/) |
| 5 | 루이의 라면가게 (pair quest) | 말티즈 루이와 3분 안에 주문대로 라면을 끓이는 3D 요리 게임 | [플레이](https://basco-git.github.io/aiffel-work/louis-ramen/) | [폴더](Pair%20Quest-gmae/) |
| 6 | my-game_rpg | 타워 브레이크(가제): 픽셀 쿼터뷰 MMORPG 0단계 테스트 버전 | [플레이](https://basco-git.github.io/aiffel-work/my-game_rpg/) | [폴더](my-game_rpg/) |
| 7 | todo | 할 일 앱: 로컬 SQLite(길 A) → Supabase·로그인·RLS(길 B) 전환 | [실행](https://basco-todo.onrender.com) | [제출 문서](todo/SUBMISSION.md) |
| 7-1 | todo-Subquest | todo 앱 AI 도구 연동: 터미널 명령 `todo`, 작업 규칙 `AGENTS.md`, 스킬 `todo-summary`, MCP 서버 `todo-files` | [사용법](todo/README.md#ai-도구-연동-터미널-명령--스킬--mcp) | [제출 문서 (길 C)](todo/SUBMISSION.md#길-c--ai-도구-연동-cli--스킬--mcp) |
| 8 | skills | 반복하던 일을 Claude Code 스킬 3개로: 제출 전 점검, 확인 장면 캡처, 과제 정리 | [설치법](skills/README.md#설치) | [스킬 모음](skills/) |

과제 진행 내용과 회고는 각 프로젝트 폴더의 README에 있습니다. 8번은 별도 프로젝트 폴더가 없어 [이 문서 아래](#8-스킬-만들기)에 적었습니다.

## 7-1 todo-Subquest 제출 내용

AI 도구(Claude Code)도 웹 화면과 같은 입력 검사·로그인·RLS를 거쳐서만 할 일을 다루게 했다. 자세한 기록과 시연 순서는 [SUBMISSION.md](todo/SUBMISSION.md), 진행 과정과 회고는 [todo README](todo/README.md#7-1-subquest-진행-과정)에 있다.

| # | 확인 | 결과 | 캡처 |
|---|---|---|---|
| C1 | 터미널 명령 `todo` | `.\todo.bat list --today` → 오늘 할 일 2건 표시 | [C1](todo/docs/screenshots/C1-cli-today-list.png) |
| C2 | 삭제 전 승인 (`AGENTS.md` 규칙) | 경로·크기·내용·git 추적 여부를 보여 주고 확인받은 뒤 그 파일 하나만 삭제 | [C2](todo/docs/screenshots/C2-approve-before-delete.png) |
| C3 | 스킬 등록 | `/todo` 입력 시 `/todo-summary`가 목록에 나옴 | [C3](todo/docs/screenshots/C3-skill-registered.png) |
| C4 | 스킬 실행 | `/todo-summary` → 오늘 완료 0건·남은 일 2건 정리 | [C4](todo/docs/screenshots/C4-skill-run-summary.png) |
| C5 | MCP 서버 `todo-files` | 허용 폴더는 `docs`·`frontend`·`backend`뿐, `.env`·`todo.db`가 있는 todo 폴더는 `Access denied` | [C5](todo/docs/screenshots/C5-mcp-todo-files.png) |

## 8. 스킬 만들기

과제: 매번 AI에게 반복해서 시키던 일을 스킬 하나로 만들어 GitHub에 올린다(마감 2026-11-09).
2026-11-02 todo 7-1을 제출하며 실제로 반복한 일 세 가지를 스킬로 만들었다. 스킬 파일은 [skills/](skills/)에 있다.

| 스킬 | 이렇게 말하면 발동 | 하는 일 | 불편 → 해결 |
|---|---|---|---|
| [submit-check](skills/submit-check/) | "제출 전 점검해 줘" | 문서 링크가 git에 있는지, 비밀값, 이미지 위치 정보, 맨 위 목록, 푸시 상태를 스크립트로 점검 | 스킬 파일이 `.gitignore`에 걸려 저장소에 빠진 채 제출할 뻔함 → 링크마다 git 포함 여부 확인 |
| [evidence-capture](skills/evidence-capture/) | "캡처 찍어 줘" | 실제 실행 결과를 HTML로 다시 그려 PNG로 저장(높이 자동), 제출 문서 표에 추가 | 캡처마다 스타일을 다시 찾고 높이가 잘려 다시 찍음 → 템플릿과 높이 자동 측정 |
| [assignment-wrapup](skills/assignment-wrapup/) | "과제 정리해 줘" | 맨 위 README 표에 한 줄, 진행 과정·회고는 과제 폴더 README에 | 회고가 맨 위 README에 쌓여 목록이 안 보였음 → 정리 원칙을 고정 |

설치: `python -I skills/install.py` (개인 스킬 폴더 `~/.claude/skills/`에 복사해 모든 프로젝트에서 발동)

### 진행 과정

| 순서 | 한 일 | 결과 |
|---|---|---|
| 1 | 오늘 반복한 일에서 스킬 후보 고르기 | 제출 전 점검, 캡처, 과제 정리 3개. 한국어 규칙·알림·삭제 전 확인은 이미 훅·규칙 파일이 맡고 있어 제외 |
| 2 | `submit-check` 점검 스크립트 | 오늘 실수를 일부러 넣은 시험 저장소에서 다섯 가지 모두 잡음, 가짜 키 값은 출력하지 않음 |
| 3 | `evidence-capture` 렌더 스크립트 | 페이지 높이를 먼저 재고 찍게 함. 잘려서 두 번 찍었던 C5가 한 번에 379px로 나옴 |
| 4 | `assignment-wrapup` 정리 원칙 | "맨 위는 목록, 자세한 내용은 과제 폴더"와 "확인된 사실만 회고에" |
| 5 | 1차 발동 시험 (새 세션 3개, 17:02) | 스킬 이름 없이 한마디 → 3개 모두 첫 동작으로 해당 스킬 호출. PR #3 병합 |
| 6 | 만든 스킬로 스킬 폴더 자체를 점검 | 오판 2건 발견·수정 (커밋 전 파일을 "문제"로 봄, 인라인 코드 속 예시 경로를 링크로 봄) |
| 7 | 맨 위 `skills/`로 옮기고 설치 스크립트 추가 | GitHub에서 바로 보이게 하고, `install.py`로 개인 스킬 폴더에 설치 |
| 8 | 2차 발동 시험 (저장소 밖 폴더, 17:13) | 다른 말투로 요청해도 3개 모두 발동 → [발동 시험 기록](skills/TRIGGER-TEST.md) |

### 회고 (8. 스킬 만들기)

- 스킬 거리를 따로 고민하지 않고, 바로 전에 한 과제(todo 7-1)에서 AI에게 여러 번 시킨 일을 골랐더니 "왜 만들었나"가 날짜와 실제 사건으로 바로 설명됨.
- 반복 지시라고 다 스킬은 아니었음. 한국어로 답하기, 알림, 삭제 전 확인처럼 **항상 지켜야 하는 규칙**은 훅·규칙 파일로, 제출 점검처럼 **가끔 하는 작업 절차**는 스킬로 나누는 것이 기준이 됨.
- description에 "언제 쓰는지 + 내가 실제로 할 말 예시 + 쓰지 않는 경우"를 넣었더니, 새 세션에서 스킬 이름을 말하지 않아도 3번 중 3번 모두 맞는 스킬이 불렸음. 말투를 바꾼 2차 시험에서도 같았음.
- 점검과 캡처처럼 결과가 매번 같아야 하는 부분은 AI 판단에 맡기지 않고 스크립트로 만들었음. AI는 스크립트를 돌리고 결과를 설명하는 역할만 하니 기준이 흔들리지 않음.
- 만든 점검 스킬을 스킬 폴더 자체에 먼저 써 보니, 커밋 전 새 파일까지 "문제"로 보는 오판이 바로 드러남. 만든 도구를 내 작업에 먼저 써 보는 것이 가장 빠른 시험이었음.
- 캡처 스킬은 편한 만큼 꾸며 낼 위험도 있어서 "이번 대화에서 실제로 실행한 결과만 그린다, 다시 그린 화면이라고 밝힌다"를 절차에 넣었음.
- `.claude/skills/`는 Claude Code가 읽는 위치지만 GitHub에서는 숨은 폴더처럼 보여 눈에 잘 띄지 않았음. 원본은 맨 위 `skills/`에 두고 설치 스크립트로 개인 스킬 폴더에 복사하는 방식으로 바꿨더니, 저장소 밖에서도 발동하게 됨. 대신 스킬을 고치면 다시 설치해야 해서 `--check`로 차이를 확인하게 함.
- 발동 시험은 새 세션을 화면 없이(`claude -p`) 열어 했음. 파일을 바꾸지 않게 쓰기 도구를 막고 턴 수를 제한하니 안전하게 반복할 수 있었고, 비용은 1차 약 1달러, 2차 약 0.56달러였음.
- 아쉬운 점: 발동 시험이 화면 없는 세션이라, 내가 직접 대화창에서 한마디로 발동시킨 화면은 아직 없음. 다음 과제를 제출할 때 실제로 써 보면서 description과 절차를 다듬을 것.
