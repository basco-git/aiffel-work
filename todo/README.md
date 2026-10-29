# Todo

내 컴퓨터에서 도는 Todo(할 일) 앱. 데이터는 로컬 SQLite에 저장한다.

## 기능

- 할 일 추가 / 목록 / 완료 표시 / 미수행 시 기간 재설정 / 삭제
- 마감일, 카테고리(태그), 오늘의 할 일 모아보기, 검색

## 구조

- [`docs/db-erd.md`](docs/db-erd.md) — DB 구조도(ERD)와 설계 설명
- [`db/schema.sql`](db/schema.sql) — SQLite 스키마
- `.env.example` — 환경 변수 예시 (`.env`로 복사해서 사용)

## 규칙

- 무료 도구만 사용
- 비밀값은 `.env`에 두고 git에 올리지 않는다
