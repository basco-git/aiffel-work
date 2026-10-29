# Todo

내 컴퓨터에서 도는 Todo(할 일) 앱. 브라우저에서 `http://localhost:5000`으로 연다.

- **길 A** (`DB_BACKEND=sqlite`): 로컬 SQLite 파일 `todo.db` 하나에 저장. 로그인 없음.
- **길 B** (`DB_BACKEND=supabase`): Supabase(PostgreSQL)에 저장. Supabase Auth 로그인, RLS로 내 할 일만 보임.

## 화면 코드와 API는 두 길에서 같고, 백엔드의 저장소 모듈만 바뀐다. 과제 제출 내용은 [SUBMISSION.md](SUBMISSION.md), 요구사항은 [PRD.md](PRD.md).

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

## 구조

```
todo/
├─ backend/
│  ├─ app.py             # Flask API 서버 + 화면 파일 제공, DB_BACKEND로 저장소 선택
│  ├─ store_sqlite.py    # 길 A 저장소 (todo.db)
│  ├─ store_supabase.py  # 길 B 저장소 + Supabase Auth 로그인
│  ├─ config.py          # .env 로드
│  └─ errors.py          # 공통 예외 → HTTP 상태 코드
├─ frontend/             # index.html, app.js, style.css — /api 만 호출
├─ db/schema.sql         # 길 A: SQLite 표·트리거·뷰
├─ supabase/schema.sql   # 길 B: PostgreSQL 표·트리거·RLS·RPC 함수
├─ scripts/check_rls.py  # 길 B RLS 확인
├─ docs/                 # ERD, 확인 장면 스크린샷, RLS 결과
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
