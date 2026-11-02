---
name: todo-summary
description: todo 앱에서 오늘 완료한 할 일을 커밋 메시지 형식으로 요약할 때 사용. "오늘 한 일 요약", "완료 요약", "커밋 메시지로 정리" 같은 요청에 쓴다.
---

# 오늘 완료 요약 (커밋 메시지 형식)

todo 폴더(AGENTS.md가 있는 곳)에서 `todo` 명령으로만 데이터를 읽는다. DB 파일이나 Supabase를 직접 건드리지 않는다.

## 1. 요약 데이터 받기

PowerShell:

```powershell
.\todo.bat summary --json
```

Git Bash:

```bash
.venv/Scripts/python.exe backend/cli.py summary --json
```

결과 JSON은 아래 모양이다.

- `date`: 오늘 날짜 (YYYY-MM-DD)
- `done_today`: 오늘 완료한 할 일 목록 (`id`, `title`, `done_at`, `memo` 등)
- `remaining_today`: 오늘 남은 할 일 목록 (`is_overdue`가 1이면 마감 지남)

## 2. 실패했을 때

- `오류: ...`가 나오면 문구를 그대로 사용자에게 전한다.
- Supabase 모드에서 `오류: 이메일 또는 비밀번호가 맞지 않습니다.`가 나오면, 세션이 Windows에 새로 등록된 값을 아직 못 받은 것일 수 있다. 값을 출력하지 말고, 그 명령에서만 사용자 환경 변수를 다시 읽어 한 번 더 시도한다.
  ```powershell
  $env:TODO_CLI_PASSWORD = [Environment]::GetEnvironmentVariable('TODO_CLI_PASSWORD','User'); .\todo.bat summary --json
  ```
  그래도 실패하면 현재 창에서 `TODO_CLI_EMAIL`, `TODO_CLI_PASSWORD`를 설정해 달라고 요청한다.

## 3. 커밋 메시지 형식으로 정리

`done_today`를 완료 시각 순서로 아래처럼 쓴다. 제목 줄은 50자 안팎으로 짧게 쓰고, 본문과 빈 줄로 나눈다.

```
오늘 할 일 N건 완료 (YYYY-MM-DD)

- #ID 제목 (HH:MM 완료)
- #ID 제목 (HH:MM 완료)

남은 일: M건 (마감 지남 K건)
```

- 완료가 여러 건이면 제목 줄에 대표 작업 하나를 넣어도 된다. 예: `과제 제출 외 2건 완료 (2026-11-02)`
- 메모가 있으면 해당 줄 끝에 ` — 메모`를 붙인다.
- 남은 일이 0건이면 마지막 줄은 `남은 일 없음`으로 쓴다.
- 오늘 완료가 0건이면 커밋 메시지를 지어내지 않는다. "오늘 완료한 할 일이 없습니다"라고 알리고, 남은 일 목록만 보여 준다.

## 4. 하지 말 것

- 요약만 한다. `git commit`을 실행하지 않는다. 사용자가 따로 요청할 때만 커밋한다.
- `done`이나 `add`처럼 데이터를 바꾸는 명령을 실행하지 않는다.
- 인증 정보(이메일, 비밀번호, 토큰)와 `.env` 내용을 출력하지 않는다.
