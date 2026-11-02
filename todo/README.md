# Todo

내 컴퓨터에서 도는 Todo(할 일) 앱. 브라우저에서 `http://localhost:5000`으로 연다.

배포본(길 B): **https://basco-todo.onrender.com** — 회원가입 후 사용. Render 무료 플랜이라 한동안 접속이 없으면 첫 접속이 30초~1분 걸린다.

> [!IMPORTANT]
> **📋 과제 제출 문서**
>
> - 📑 **[SUBMISSION.md](SUBMISSION.md)** — 확인 장면(로컬·Supabase·AI 도구 연동), 클라우드 전환·RLS·CLI·스킬·MCP 기록, 3분 시연 순서
> - 📝 **[PRD.md](PRD.md)** — 요구사항 정의서

- **길 A** (`DB_BACKEND=sqlite`): 로컬 SQLite 파일 `todo.db` 하나에 저장. 로그인 없음.
- **길 B** (`DB_BACKEND=supabase`): Supabase(PostgreSQL)에 저장. Supabase Auth 로그인, RLS로 내 할 일만 보임.

화면 코드와 API는 두 길에서 같고, 백엔드의 저장소 모듈만 바뀐다.

## 기능

- 할 일 추가 / 목록 / 완료 표시 / 삭제
- 미수행 시 기간 재설정 (재설정 이유와 기록, 미룬 횟수 표시)
- 마감일 표시 (지난 일은 빨간색), 카테고리(태그), 오늘의 할 일 탭, 검색(제목·메모·태그)

## 실행 (Windows)

```powershell
cd todo
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python backend\app.py
```

브라우저에서 http://localhost:5000 을 연다. 종료는 터미널에서 `Ctrl+C`.
`todo.db`는 처음 실행할 때 자동으로 만들어지고, 서버를 껐다 켜도 데이터가 남는다.

### 더블클릭으로 쓰기 (설치 후)

| 파일 | 하는 일 |
|---|---|
| `start.bat` | 서버가 꺼져 있으면 창 없이 켜고 브라우저로 연다. 이미 켜져 있으면 브라우저만 연다 |
| `stop.bat` | 서버 종료 |
| `autostart-on.bat` | 윈도우 로그인 시 서버 자동 실행 (시작프로그램에 `Todo 서버` 바로가기 추가) |
| `autostart-off.bat` | 자동 실행 해제 (바로가기 삭제) |

창 없이 켜진 서버의 출력은 `server.log`에 남는다. 포트를 5000이 아닌 값으로 바꾸면 `start.bat`의 주소도 같이 바꿔야 한다.

## 길 B: Supabase로 전환

1. supabase.com에서 무료 프로젝트를 만든다.
2. 대시보드 **SQL Editor**에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 Run (표·트리거·RLS·함수 생성, 여러 번 실행해도 안전).
3. **Project Settings > API Keys**에서 Project URL과 공개용 키(publishable 또는 anon)를 `.env`에 넣는다. `service_role`/secret 키는 넣지 않는다.
4. `.env`의 `FLASK_SECRET_KEY`에 32자 이상 임의 문자열을 넣고, `DB_BACKEND=supabase`로 바꾼다.
5. `stop.bat` → `start.bat`. 화면에 `Supabase` 표시와 로그인 창이 나오면 회원가입 후 사용.
6. RLS 확인: `.venv\Scripts\python scripts\check_rls.py` (계정 2개 필요). 결과는 `docs/rls-check-result.txt`.

길 A로 돌아가려면 `DB_BACKEND=sqlite`로 바꾸고 서버를 다시 켜면 된다. 두 DB의 데이터는 서로 따로다.

## AI 도구 연동 (터미널 명령 · 스킬 · MCP)

AI 도구(Claude Code 등)가 할 일을 다룰 때도 DB를 직접 건드리지 않고 앱의 API를 거치게 했다. 규칙은 [`AGENTS.md`](AGENTS.md)에 있고, `CLAUDE.md`는 이 파일을 불러온다.

### 터미널 명령 `todo`

`backend/cli.py`는 Flask 앱의 API를 `test_client`로 부르는 얇은 진입점이다. 그래서 입력 검사, 저장소 선택(`DB_BACKEND`), 로그인과 RLS가 웹 화면과 똑같이 적용된다. todo 폴더에서 실행한다.

| 하는 일 | PowerShell |
|---|---|
| 추가 | `.\todo.bat add "제목" --due 2026-11-03 --memo "메모"` |
| 목록 | `.\todo.bat list` (`--status all\|active\|done`, `--today`) |
| 완료 | `.\todo.bat done 3 5` (되돌리는 명령 없음) |
| 오늘 완료 요약 | `.\todo.bat summary` |

- 모든 명령에 `--json`을 붙이면 JSON으로 출력한다. 실패하면 `오류: ...`를 쓰고 종료 코드 1로 끝난다.
- 길 B(Supabase)에서는 로그인 정보를 환경 변수 `TODO_CLI_EMAIL`, `TODO_CLI_PASSWORD`로만 받는다.
- 마감일 변경과 삭제는 명령에 없다. 웹 화면에서 한다.

### 스킬 `todo-summary`

[`.claude/skills/todo-summary/SKILL.md`](.claude/skills/todo-summary/SKILL.md). Claude Code에서 `/todo-summary` 또는 "오늘 한 일 요약"이라고 하면 `todo summary --json` 결과를 커밋 메시지 형식으로 정리한다.

### MCP 서버 `todo-files`

[`.mcp.json`](.mcp.json)에 파일 MCP 서버(`@modelcontextprotocol/server-filesystem`)를 등록했다. 열린 폴더는 `docs`, `frontend`, `backend`뿐이다. `.env`와 `todo.db`가 있는 todo 폴더 자체는 열지 않으므로 MCP로 접근하면 `Access denied`가 난다. Claude Code를 처음 열 때 이 서버를 쓸지 묻는 창이 나오면 승인한다. Node.js(`npx`)가 필요하다.

## 배포 (Render)

배포 주소: https://basco-todo.onrender.com (길 B, Render 무료 플랜)

저장소 맨 위의 [`render.yaml`](../render.yaml)로 길 B를 Render 무료 플랜에 올린다.

1. render.com에 GitHub 계정으로 로그인 → **New → Blueprint**.
2. **Public Git Repository**에 `https://github.com/basco-git/aiffel-work`를 넣고 **Connect** (또는 GitHub 계정을 연결해 `aiffel-work` 선택).
3. Branch `main`, Blueprint Path `render.yaml` 확인.
4. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`에 `.env`의 값을 넣는다. `FLASK_SECRET_KEY`는 Render가 만든다.
5. **Deploy Blueprint**. 몇 분 뒤 배포 주소가 열린다.
6. Supabase 대시보드 **Authentication → URL Configuration**에서 **Site URL**을 배포 주소(`https://basco-todo.onrender.com`)로 바꾸고 **Save**. 바꾸지 않으면 회원가입 인증 메일의 링크가 localhost로 간다. Redirect URLs는 그대로 둔다.
   - 바로 가기: `https://supabase.com/dashboard/project/<프로젝트 ID>/auth/url-configuration` (프로젝트 ID는 `SUPABASE_URL`의 `https://` 뒤 부분)
   - 이미 가입된 계정은 영향 없음. 로컬에서 가입해도 인증 링크는 배포 주소로 가지만, 같은 Supabase라 인증 후 로컬에서도 로그인된다.

참고
- 무료 플랜은 15분 동안 접속이 없으면 잠들어, 다음 첫 접속이 30초~1분 걸린다. 시연 전에 한 번 열어 둔다.
- 공개 저장소 주소로 연결했다면 푸시해도 자동 배포되지 않는다. Render 화면에서 **Manual Deploy**를 누른다.
- 배포에서는 로그인 쿠키를 HTTPS로만 보낸다(`SESSION_COOKIE_SECURE=1`, `render.yaml`에 설정).

## 구조

```
todo/
├─ backend/
│  ├─ app.py             # Flask API 서버 + 화면 파일 제공, DB_BACKEND로 저장소 선택
│  ├─ store_sqlite.py    # 길 A 저장소 (todo.db)
│  ├─ store_supabase.py  # 길 B 저장소 + Supabase Auth 로그인
│  ├─ cli.py             # 터미널 명령 todo (API를 test_client로 호출)
│  ├─ config.py          # .env 로드
│  └─ errors.py          # 공통 예외 → HTTP 상태 코드
├─ frontend/             # index.html, app.js, style.css — /api 만 호출
├─ db/schema.sql         # 길 A: SQLite 표·트리거·뷰
├─ supabase/schema.sql   # 길 B: PostgreSQL 표·트리거·RLS·RPC 함수
├─ scripts/check_rls.py  # 길 B RLS 확인
├─ docs/                 # ERD, 확인 장면 스크린샷, RLS 결과
├─ .claude/skills/todo-summary/  # 오늘 완료 요약 스킬
├─ AGENTS.md, CLAUDE.md  # AI 도구 작업 규칙
├─ .mcp.json             # MCP 서버 todo-files (docs·frontend·backend만)
├─ todo.bat              # todo 명령 실행 (PowerShell·cmd)
├─ PRD.md, SUBMISSION.md
├─ .env.example
└─ requirements.txt
```

브라우저 → `/api/*` → `app.py` → `store_*.py` → `todo.db` 또는 Supabase. 서버는 `127.0.0.1`에만 열려 다른 컴퓨터에서는 접속할 수 없다.
길 B의 백엔드는 공개용 키 + 로그인한 사용자의 토큰으로만 Supabase에 요청하므로, 무엇이 보이고 바뀌는지는 DB의 RLS가 결정한다.

## API

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/todos?q=&tag=&status=all\|active\|done` | 목록 (검색·태그·상태 필터) |
| GET | `/api/todos/today` | 오늘의 할 일 (오늘 마감, 마감 지남, ☆로 고른 일) |
| POST | `/api/todos` | 추가 `{title, memo?, due_date?, tag_ids?}` |
| GET | `/api/todos/<id>` | 하나 조회 |
| PATCH | `/api/todos/<id>` | 수정 `{title?, memo?, is_done?, is_today_pick?, tag_ids?}` |
| POST | `/api/todos/<id>/reschedule` | 마감일 재설정 `{due_date, reason?}` |
| GET | `/api/todos/<id>/history` | 재설정 기록 |
| DELETE | `/api/todos/<id>` | 삭제 |
| GET / POST | `/api/tags` | 태그 목록 / 추가 `{name, color?}` |
| DELETE | `/api/tags/<id>` | 태그 삭제 (할 일은 남음) |
| GET | `/api/auth/me` | 현재 모드(`sqlite`/`supabase`)와 로그인 사용자 |
| POST | `/api/auth/signup` · `/api/auth/login` · `/api/auth/logout` | 길 B 로그인 `{email, password}` |

날짜는 `YYYY-MM-DD` 형식만 받는다. 잘못된 입력은 400, 로그인 필요 401, 없는 항목은 404, 중복 태그·같은 날짜로 재설정은 409.

## 규칙

- 무료 도구만 사용 (Python, Flask, SQLite, Supabase 무료 플랜)
- `.env`, `todo.db`는 git에 올리지 않는다 (`.gitignore`)
- 로그인은 직접 만들지 않고 Supabase Auth를 쓴다

## 회고 (길 A → 길 B)

- 코드보다 DB 구조(표·열·관계)를 먼저 구조도로 받고, "전체 계획 + 단계마다 확인할 것"을 요청하니 단계별로 무엇이 끝났는지 분명하게 확인하며 진행할 수 있었음.
- "날짜는 날짜 형식으로"라고 요청했는데 SQLite에는 날짜 타입이 없어서 형식 검사(CHECK)로 해결. 처음 만든 검사는 잘못된 날짜도 통과시키는 구멍이 있었는데, 실제로 값을 넣어 보는 테스트에서 발견해 바로잡음.
- 로컬 앱은 서버가 켜져 있어야 열린다는 걸 처음 알게 됨. 매번 켜기 불편해서 더블클릭 실행(start.bat)과 윈도우 시작 시 자동 실행까지 추가함.
- 길 B 전환은 `.env` 한 줄(`DB_BACKEND`)로 바뀌게 만들어, 화면과 API 코드는 그대로 두고 DB 계층만 교체함.
- Supabase 계정 생성·키 확인·회원가입은 Claude가 대신할 수 없어서 직접 해야 했음. 대시보드 화면이 안내와 달라(Confirm email 위치 등) 헤맸고, SQL Editor에 파일 내용 대신 파일 경로를 붙여넣어 오류가 나기도 함.
- RLS SQL은 Supabase에 올리기 전에 내 컴퓨터의 PostgreSQL로 "다른 사용자의 할 일이 안 보이는지"를 먼저 검증받고 적용하니, Supabase에서는 한 번에 성공함.
- 확인 장면 캡처 때 삭제 "확인창"만 찍고 삭제 "결과"는 안 찍어서 추가 캡처가 필요했음. 증빙은 결과가 보이는 화면으로 남겨야 함.
- 공개 저장소에 올리는 캡처에 이메일이 보여서 앞부분만 가림 처리함. 올리기 전에 개인정보가 보이는지 확인하는 습관이 필요함.
- 전체 흐름: 로컬 SQLite(길 A) → Supabase 클라우드 DB + 로그인 + RLS(길 B) → Render 배포(https://basco-todo.onrender.com) 순서로 단계별로 키워 감.
- Supabase 연결은 프로젝트 생성 → SQL Editor에서 `schema.sql` 실행 → 공개용 키를 `.env`에 넣기 → `DB_BACKEND=supabase` 순서. service_role 키는 RLS를 우회하므로 쓰지 않음.
- 처음 PRD에서는 배포를 범위 밖으로 뺐음. 다른 과제(게임·블로그)는 HTML만 있어 GitHub Pages에 바로 올라갔지만, todo는 Flask 서버가 계속 돌아야 해서 별도 서버 호스팅(Render)이 필요했음. 길 A(SQLite 파일)는 무료 호스팅에서 파일이 지워질 수 있어 길 B로만 배포함.
- 배포 설정은 `render.yaml` 파일 하나로 정리하고, Supabase 키 같은 비밀값은 git이 아닌 Render 화면에서 직접 입력함.
- Render의 저장소 연결 화면에서 막혔는데, 공개 저장소 주소를 붙여넣는 방법으로 해결함. 계정 가입·키 입력은 Claude가 대신할 수 없어 직접 해야 했음.
- 배포 후 Claude가 주소로 직접 요청을 보내 화면 열림·Supabase 연결·비로그인 차단을 확인함.
- 배포하면 Supabase의 Site URL도 배포 주소로 바꿔야 회원가입 인증 메일 링크가 localhost가 아닌 배포 앱으로 감. 코드 밖 설정도 같이 챙겨야 한다는 걸 배움.
- Render 무료 플랜은 15분 동안 접속이 없으면 잠들어 첫 접속이 30초~1분 걸림. 시연 전에 미리 열어 둬야 함.
- 작업 중 오류 4건(날짜 검사 구멍, 로컬 모드 로그인 500 오류, 로그아웃 버튼 숨김 안 됨, 서버 종료 스크립트 경로 문제)은 모두 테스트 단계에서 잡고 고침.

## 7-1 Subquest 진행 과정

목표: AI 도구(Claude Code)가 할 일 데이터를 다룰 때도 웹 화면과 같은 입력 검사·로그인·RLS를 거치게 하고, 비밀값(`.env`)과 DB 파일(`todo.db`)에는 닿지 않게 한다. 확인 장면은 [SUBMISSION.md의 길 C](SUBMISSION.md#길-c--ai-도구-연동-cli--스킬--mcp)에 있다.

| 순서 | 한 일 | 결과 |
|---|---|---|
| 1 | 터미널 명령 `todo` 만들기 (`backend/cli.py`, `todo.bat`) | add·list·done·summary, `--json`. 앱 API를 `test_client`로 불러 저장소 로직을 복사하지 않음 (C1) |
| 2 | 작업 규칙 `AGENTS.md` 쓰기 (`CLAUDE.md`가 불러옴) | 데이터는 `todo` 명령으로만, 바꾸는 명령·삭제는 실행 전 확인, 비밀값 출력 금지. 삭제 전 승인 실습 (C2) |
| 3 | 스킬 `todo-summary` 만들기 | `/todo-summary`로 오늘 완료한 일을 커밋 메시지 형식으로 정리 (C3, C4) |
| 4 | MCP 서버 `todo-files` 등록 (`.mcp.json`) | `docs`·`frontend`·`backend`만 열고 todo 폴더 자체는 열지 않음 |
| 5 | Claude Code 다시 시작 → 연결 확인 | 허용 폴더 3개만 보이고 todo 폴더 접근은 `Access denied` (C5) |
| 6 | 제출 문서 보강 | `SUBMISSION.md`(길 C 표·기록·시연 순서), `README.md`, `PRD.md`(AI 도구 연동 절·완료 기준) |
| 7 | 제출 전 점검 → 빠진 파일 발견 | 루트 `.gitignore`가 `.claude/` 전체를 빼고 있어 스킬 파일이 저장소에 없었음 → `skills/`만 공유하도록 고침 |
| 8 | 과제 제출 정리 | 루트 README는 프로젝트 목록 표만, 회고는 각 프로젝트 README로 옮김. PR #2로 `main`에 반영 |

## 회고 (7-1 Subquest)

- AI에게 DB를 직접 열어 주지 않고, 앱 API를 그대로 부르는 터미널 명령을 만들어 주니 입력 검사·로그인·RLS를 다시 만들 필요 없이 웹 화면과 똑같은 보호가 적용됨. "AI용 통로를 따로 만들지 않는다"가 핵심이었음.
- 규칙을 `AGENTS.md` 한 파일에 모으고 `CLAUDE.md`는 그 파일을 불러오게 하니, 도구가 바뀌어도 같은 규칙을 쓸 수 있음.
- `.bat` 파일을 LF 줄바꿈으로 저장했더니 cmd가 한글 주석 줄을 명령으로 읽어 오류가 남. CRLF로 저장해 해결했고, 다시 겪지 않도록 `AGENTS.md`에 규칙으로 남김.
- Supabase 모드에서 터미널 명령이 로그인에 실패한 적이 있음. Windows에 새로 등록한 환경 변수를 이미 열려 있던 세션이 아직 받지 못한 것이 원인이어서, 대처 방법을 스킬에 적어 둠.
- 삭제를 요청해도 AI가 바로 지우지 않고 경로·크기·내용·git 추적 여부를 보여 준 뒤 확인받게 하니, 이름이 조금 다른 파일을 지울 뻔한 것도 미리 알 수 있었음.
- MCP는 파일만 등록해서는 끝나지 않고, Claude Code를 다시 시작해 서버 사용을 승인해야 연결됨. 다시 시작하면 대화가 끊기므로 이어서 할 일을 메모로 남겨 두고 재시작함.
- MCP 파일 서버는 폴더 단위로 열리므로 todo 폴더를 통째로 열면 `.env`와 `todo.db`까지 보임. 필요한 하위 폴더 3개만 열고, 막힌 폴더에 실제로 접근해 `Access denied`가 나는지까지 확인함.
- 제출 직전 점검에서 스킬 파일이 `.gitignore` 때문에 저장소에 아예 없던 것을 발견함. 캡처에는 나오는데 파일은 없는 상태로 제출할 뻔했음. 문서에 건 링크가 실제로 git에 올라가 있는지 확인하는 단계가 필요함.
- C3~C5 캡처는 실제 실행 결과를 HTML로 다시 그린 화면이라 제출 문서에 그 사실을 밝혀 둠.
- 공개 저장소에 올리는 사진은 화면뿐 아니라 위치 정보 같은 메타데이터도 확인하고 올림.
