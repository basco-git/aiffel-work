# Todo

내 컴퓨터에서 도는 Todo(할 일) 앱. 데이터는 로컬 SQLite 파일 `todo.db` 하나에 저장되고, 브라우저에서 `http://localhost:5000`으로 연다.

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

## 구조

```
todo/
├─ backend/
│  ├─ app.py      # Flask API 서버 + 화면 파일 제공
│  └─ db.py       # SQLite 접근 (DB를 다루는 코드는 여기에만)
├─ frontend/      # index.html, app.js, style.css — /api 만 호출
├─ db/schema.sql  # 테이블·트리거·뷰
├─ docs/db-erd.md # DB 구조도(ERD)
├─ .env.example   # DB_PATH, HOST, PORT
└─ requirements.txt
```

브라우저 → `/api/*` → `app.py` → `db.py` → `todo.db`. 서버는 `127.0.0.1`에만 열려 다른 컴퓨터에서는 접속할 수 없다.

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

날짜는 `YYYY-MM-DD` 형식만 받는다. 잘못된 입력은 400, 없는 항목은 404, 중복 태그·같은 날짜로 재설정은 409.

## 규칙

- 무료 도구만 사용 (Python, Flask, SQLite)
- `.env`, `todo.db`는 git에 올리지 않는다 (`.gitignore`)
