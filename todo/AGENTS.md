# AGENTS.md: todo 앱 작업 규칙

이 폴더는 할 일 관리 앱(Flask + SQLite 또는 Supabase)이다. AI 도구는 아래 규칙을 따른다.

## 할 일 데이터는 todo 명령으로 다룬다

할 일을 읽거나 바꿀 때는 DB 파일이나 Supabase를 직접 건드리지 않고, 항상 `todo` 명령을 쓴다.
이 명령은 앱의 API를 그대로 부르므로 입력 검사, 로그인, RLS가 웹 화면과 똑같이 적용된다.

| 하는 일 | PowerShell | Git Bash |
| --- | --- | --- |
| 추가 | `.\todo.bat add "제목" --due 2026-11-03 --memo "메모"` | `.venv/Scripts/python.exe backend/cli.py add "제목" --due 2026-11-03` |
| 목록 | `.\todo.bat list` (`--status all\|active\|done`, `--today`) | `.venv/Scripts/python.exe backend/cli.py list` |
| 완료 | `.\todo.bat done 3 5` | `.venv/Scripts/python.exe backend/cli.py done 3 5` |
| 오늘 완료 요약 | `.\todo.bat summary` | `.venv/Scripts/python.exe backend/cli.py summary` |

- 명령은 todo 폴더(이 파일이 있는 곳)에서 실행한다.
- 결과를 분석할 때는 `--json`을 붙여 JSON으로 받는다.
- 실패하면 `오류: ...`를 stderr에 쓰고 종료 코드 1로 끝난다. 오류 문구를 그대로 사용자에게 전한다.
- 날짜는 `YYYY-MM-DD` 형식이다. 마감일 변경과 삭제는 명령에 없으므로 웹 화면에서 하라고 안내한다.
- 바꾸는 명령(`add`, `done`)은 실행 전에 무엇을 바꿀지 사용자에게 알린다. `done`은 되돌리는 명령이 없다.

## 저장소와 테스트 데이터

- 저장소는 `.env`의 `DB_BACKEND`로 정해진다: `sqlite`는 `todo.db`, `supabase`는 클라우드.
- 실습과 시험은 테스트 데이터로만 한다. 로컬에서 시험할 때는 환경 변수로 별도 DB를 지정한다. 환경 변수가 `.env`보다 우선한다.
  ```powershell
  $env:DB_BACKEND = "sqlite"; $env:DB_PATH = "$env:TEMP\todo-test.db"
  ```
- Supabase 모드에서는 테스트 계정을 환경 변수 `TODO_CLI_EMAIL`, `TODO_CLI_PASSWORD`로 받는다. 값이 없으면 사용자에게 현재 창에서 설정해 달라고 요청한다.

## 코드 구조

- `backend/app.py`: API 서버. `backend/store_sqlite.py`, `backend/store_supabase.py`: 저장소. DB 접근은 이 두 파일에서만 한다.
- `backend/cli.py`: todo 명령. 앱의 API를 `test_client`로 부르는 얇은 진입점이다. 기능을 더할 때도 API를 거치게 하고, 저장소 로직을 복사하지 않는다.
- 앱 코드를 고치기 전에는 커밋해서 되돌릴 지점을 만든다.

## 하지 말 것

- 인증 정보(비밀번호, 토큰, 키)를 이 파일, 스킬, 코드, 커밋, 출력에 쓰지 않는다. `.env` 내용을 출력하지 않는다.
- `service_role`이나 `secret` 키를 쓰지 않고, 접속하려고 RLS 같은 접근 제한을 풀지 않는다.
- `todo.db`나 Supabase 표를 SQL로 직접 고치지 않는다. 데이터는 todo 명령으로만 다룬다.
- 실제 사용자 데이터로 시험하지 않는다.
- `.bat` 파일을 LF 줄바꿈으로 저장하지 않는다. LF로 저장했더니 한글 주석 줄을 cmd가 명령으로 읽어 오류가 났다. 새 bat 파일은 CRLF로 저장한다.
