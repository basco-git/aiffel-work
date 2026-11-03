# 인수인계 — 여기까지 한 일과 이어서 할 일

> 2026-11-03 작성. 사용량이 끝나 대화가 끊겨도, 새 대화에서 이 파일 하나만 읽으면 이어서 할 수 있게 정리했어요.
> 새 대화 시작 문장 예: `aiffel-work/interview-booking/docs/handoff.md 읽고 '이어서 할 일' 1번부터 진행해 줘`

## 과제 개요
- 과제: Main Quest 01 「내 서비스 만들기」(교안 8번), **마감 2026-11-04 오전**
- 제출물: 실행 가능한 웹 서비스(저장소·배포 URL), PRD.md, retrospective.md, 3분 이내 시연 영상
- 루브릭: 도메인 연결성 25 · 기능 완성도 25 · AI 활용도 20 · 회고 깊이 15 · 발표/시연 15
- 주제: **면접 한 번에** — 면접관 2~3명이 링크로 가능한 시간을 체크하면, 인원이 모인 시간만 후보자에게 열리고, 후보자가 링크로 예약·변경 (HR 15년 경력의 불편에서 출발)
- 위치: `aiffel-work/interview-booking/` · 브랜치 `interview-booking` (main에는 PR로 합치기, 아직 푸시 안 함)

## 파일 지도
| 파일 | 내용 | 상태 |
|---|---|---|
| `PRD.md` | 한 문장, 사용자, 흐름, Must 3·Should·Won't 6, 규칙 R1~R9, 완성 기준, 성공 조건 3, 검증 기록 표(9장) | 확정 |
| `AGENTS.md` / `CLAUDE.md` | 작업 규칙(한국어, 한 번에 하나, 작동하면 커밋, reset --hard 금지, 비밀값 금지, PRD 9장 기록, 사용량 아끼기) / `@AGENTS.md`로 연결 | 완료 |
| `docs/design.md` | 기술 비교(Supabase+정적 화면 채택, Node+SQLite·Firebase 기각), 데이터 설계, 규칙별 막는 곳, 화면·주소 | 완료 |
| `supabase/schema.sql` | 표 6개(positions·interviewers·candidates·slots·availability·bookings), RLS, 토큰 함수 4개(`interviewer_view`, `set_availability`, `candidate_view`, `book_slot`) | 로컬 검증 완료, **Supabase 실행 전** |
| `supabase/local-test/` | `supabase_stub.sql`(auth 흉내), `run.sh`(규칙 시험 19개) | 완료 |
| `docs/evidence-local-rules.txt` | 로컬 시험 결과: **19/19 통과, 동시 예약 10건 중 1건 성공** | 완료 |
| `docs/supabase-setup.md` | 사용자가 할 Supabase 설정 순서 | 완료 |
| `docs/progress.md` | 단계별 진행 기록(결정한 사람, 확인한 것, 커밋)과 막혔던 곳 | 계속 추가 |
| `.env.example` | URL·공개 키·시험용 담당자 A/B 계정 자리 | 완료 |

## 사용자가 정한 것 (바꾸지 않기)
- 주제 1번(면접 일정 예약), 폴더 이름 `interview-booking`
- 면접 길이 **15분 단위**(15~120분, 기본 30분), 면접관 **2~3명** 일정 함께, 변경 요청이 잦음
- DB 반영은 **SQL 파일을 Supabase SQL Editor에 붙여 넣는 방식** (MCP 안 씀)
- 규칙 파일은 AGENTS.md로 쓰고 CLAUDE.md에서 연결
- Git으로 단계마다 커밋, **진행 기록 문서화 필수**
- 사용량이 적으니 서브에이전트·MCP는 쓰지 않기, 보고는 짧게

## 로컬 규칙 시험 다시 돌리는 법 (선택)
임시 DB는 이 대화의 임시 폴더에 있어서 새 대화에서는 다시 만들어야 해요.
```bash
B="/c/Program Files/PostgreSQL/18/bin"; D=<임시폴더>/pgtest
"$B/initdb" -D "$D" -U postgres -A trust -E UTF8 --locale=C
"$B/pg_ctl" -D "$D" -o "-p 54329" -l "$D.log" start
PGCLIENTENCODING=UTF8 "$B/psql" -p 54329 -U postgres -f supabase/local-test/supabase_stub.sql
PSQL="$B/psql" bash supabase/local-test/run.sh
```
(사용자의 PostgreSQL 서비스(5432)는 비밀번호가 필요해서 건드리지 않았어요.)

## 이어서 할 일 (순서대로)
1. **(사용자)** `docs/supabase-setup.md` 따라 Supabase 프로젝트 생성 → `schema.sql` 실행 → Confirm email 끄기 → 시험용 담당자 A·B 계정 → `.env` 작성 → **Project URL과 공개 키를 채팅으로 전달** (비밀 키는 절대 X)
2. 화면 3개 만들기 (순수 HTML·CSS·JS + `@supabase/supabase-js` CDN 버전 고정, `config.js`에 URL·공개 키)
   - `index.html` 담당자: 로그인, 포지션(필요 면접관 2·3), 면접관·후보자 추가와 링크 복사, 시간 추가(15분 단위), 시간별 가능 면접관 수·예약자 현황, 예약 취소
   - `interviewer.html?t=토큰`: `interviewer_view` → 체크하면 `set_availability`
   - `candidate.html?t=토큰`: `candidate_view` → `book_slot`(처음이면 예약, 있으면 변경). 오류 메시지는 함수가 준 한국어 그대로 표시
   - 먼저 화면을 띄워 확인 → 커밋 → progress.md 한 줄
3. `package.json` + `scripts/test-rules.mjs` → `npm run test:rules`: 공개 키 + 담당자 A·B 로그인 + 링크 토큰으로 R1~R9를 실제 Supabase에 시험(동시 예약 10건 → 1건 성공), 시험 데이터만 정리 → 결과를 PRD 9장에 기록
4. GitHub Pages 배포: PR로 main에 합치면 `https://basco-git.github.io/aiffel-work/interview-booking/` (기존 과제와 같은 방식인지 확인) → Supabase Site URL 설정 → 다른 기기·시크릿 창에서 한 바퀴 → PRD 9장
5. 마무리: `retrospective.md`(무엇을 잘랐나 / 막혀서 어떻게 풀었나 / 다음 한 걸음 + 교안 회고 질문 3개), 폴더 README(진행 과정 표, 교안 1~8 반영표), 맨 위 README 표에 9번 추가(`assignment-wrapup` 스킬), 제출 전 점검(`submit-check` 스킬), 3분 시연 대본
6. 마감이 급하면 축소안: 면접관 체크 화면을 빼고 담당자가 면접관을 직접 지정 (PRD 4장 주석대로 progress.md에 기록)

## 교안 1~8 반영 계획 (README에 쓸 표)
| 교안 | 증거 |
|---|---|
| 1 개발 환경 | Claude Code 작업대, 위험한 작업은 계획 먼저·승인 후 실행 |
| 2 Git | 브랜치 `interview-booking`, 확인 후 커밋, PR로 main 합치기 |
| 3 세 겹 | HTML·CSS·JS 화면 3개, PRD로 계획 맞추기 |
| 4 프레임워크 | 프레임워크 채택·기각 이유(design.md), 목업으로 화면 먼저 |
| 5 백엔드·DB | 표 6개·1:N·N:M 설계, RLS, `.env`, 파라미터 대신 토큰 함수 |
| 6 네트워크·배포 | GitHub Pages 공개 URL, Network 탭 상태 코드, 입력 검증 |
| 7 에이전트 도구 | AGENTS.md·CLAUDE.md 규칙 파일, 스킬(submit-check·evidence-capture·assignment-wrapup) |
| 8 메인 퀘스트 | 한 문장, Must 3·Won't 6, DB가 지키는 규칙 R1~R9, 검증 기록, 회고, 시연 |
