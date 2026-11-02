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
| 8 | skills | 반복하던 일을 Claude Code 스킬 3개로: 제출 전 점검, 확인 장면 캡처, 과제 정리 | - | [스킬 모음](.claude/skills/) |

과제 진행 내용과 회고는 각 프로젝트 폴더의 README에 있습니다.

## 7-1 todo-Subquest 제출 내용

AI 도구(Claude Code)도 웹 화면과 같은 입력 검사·로그인·RLS를 거쳐서만 할 일을 다루게 했다. 자세한 기록과 시연 순서는 [SUBMISSION.md](todo/SUBMISSION.md), 진행 과정과 회고는 [todo README](todo/README.md#7-1-subquest-진행-과정)에 있다.

| # | 확인 | 결과 | 캡처 |
|---|---|---|---|
| C1 | 터미널 명령 `todo` | `.\todo.bat list --today` → 오늘 할 일 2건 표시 | [C1](todo/docs/screenshots/C1-cli-today-list.png) |
| C2 | 삭제 전 승인 (`AGENTS.md` 규칙) | 경로·크기·내용·git 추적 여부를 보여 주고 확인받은 뒤 그 파일 하나만 삭제 | [C2](todo/docs/screenshots/C2-approve-before-delete.png) |
| C3 | 스킬 등록 | `/todo` 입력 시 `/todo-summary`가 목록에 나옴 | [C3](todo/docs/screenshots/C3-skill-registered.png) |
| C4 | 스킬 실행 | `/todo-summary` → 오늘 완료 0건·남은 일 2건 정리 | [C4](todo/docs/screenshots/C4-skill-run-summary.png) |
| C5 | MCP 서버 `todo-files` | 허용 폴더는 `docs`·`frontend`·`backend`뿐, `.env`·`todo.db`가 있는 todo 폴더는 `Access denied` | [C5](todo/docs/screenshots/C5-mcp-todo-files.png) |
