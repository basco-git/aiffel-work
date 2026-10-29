# 과제 제출: Todo 앱 (길 A → 길 B)

- 저장소: https://github.com/basco-git/aiffel-work/tree/main/todo
- PRD: [PRD.md](PRD.md)
- 배포: 하지 않음 (로컬 서버 `http://localhost:5000` + 클라우드 DB)

## 기록 (한 줄씩)

- **클라우드 전환**: _(Supabase 확인 후 작성)_
- **RLS 확인**: _(scripts/check_rls.py 실행 후 작성)_

## 확인 장면

### 길 A — 로컬 SQLite (`DB_BACKEND=sqlite`)

| # | 확인 | 결과 | 장면 |
|---|---|---|---|
| A1 | 할 일 목록 (시연용 3개 추가) | 4개 표시, 마감 지난 일 빨간색 | ![A1](docs/screenshots/A1-local-list.jpg) |
| A2 | 완료 + 삭제 | `[시연] 보고서 초안 쓰기` 완료(취소선, 완료 시각 기록), `[시연] 장보기` 삭제 → 3개 | ![A2](docs/screenshots/A2-local-done-delete.jpg) |
| A3 | 앱 껐다 켜기 | 2026-10-29 17:04:35 서버 종료(접속 거부 확인) → 다시 켠 뒤 3개 그대로, 완료 상태 유지 | ![A3](docs/screenshots/A3-local-after-restart.jpg) |

### 길 B — Supabase (`DB_BACKEND=supabase`)

| # | 확인 | 결과 | 장면 |
|---|---|---|---|
| B1 | 로그인 후 할 일 목록 | _(작성 예정)_ | |
| B2 | 완료 + 삭제 | _(작성 예정)_ | |
| B3 | 앱 껐다 켜기 | _(작성 예정)_ | |
| B4 | 다른 계정으로 로그인 → A의 할 일 안 보임 (RLS) | _(작성 예정)_ | |

## 3분 시연 순서 (녹화용)

| 시간 | 화면 | 말할 것 |
|---|---|---|
| 0:00–0:20 | PRD.md | 무엇을 만들었는지: 로컬 Todo → Supabase 전환, 기본 CRUD + 마감일·태그·오늘·검색 |
| 0:20–1:00 | 길 A 앱 (`로컬 SQLite` 표시) | 추가 → 완료 → 삭제. `stop.bat` → 새로고침(접속 안 됨) → `start.bat` → 할 일 그대로 |
| 1:00–1:20 | `.env` (키 부분은 가리기) | `DB_BACKEND=supabase` 한 줄로 전환. 화면·API 코드는 그대로 |
| 1:20–2:10 | 길 B 앱 (`Supabase` 표시) | 로그인 → 추가 → 완료 → 삭제. 서버 껐다 켜기 → 그대로. Supabase 대시보드 Table Editor에 같은 행 |
| 2:10–2:50 | 다른 계정 로그인 + `check_rls.py` 결과 | B 계정에는 A의 할 일이 안 보임. 스크립트 결과 전부 PASS |
| 2:50–3:00 | 마무리 | 비밀값은 `.env`, service_role 키는 쓰지 않음, 로그인은 Supabase Auth |
