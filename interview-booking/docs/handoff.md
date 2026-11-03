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
| `index.html` · `assets/owner.js` · `assets/styles.css` | 담당자 화면: 로그인, 포지션, 면접관·후보자 추가와 링크 복사, 시간 추가, 시간별 가능 인원·예약자, 예약 취소 | 완료 (가짜 데이터 미리보기 확인) |
| `interviewer.html` · `assets/interviewer.js` | 면접관 화면(`?t=토큰`): 가능 체크. 예약된 시간은 잠김 | 완료 (가짜 데이터 미리보기 확인) |
| `candidate.html` · `assets/candidate.js` | 후보자 화면(`?t=토큰`): 열린 시간만 보이고 예약·변경, 함수 오류 문구 그대로 표시 | 완료 (가짜 데이터 미리보기 확인) |
| `assets/app.js` | 공용: Supabase 연결, 한국 시간 표시, 토스트, 링크 복사, 설정 안내 | 완료 |
| `assets/config.js` | Project URL·Publishable key (공개 값만) | 완료 (`d6d88db`에 반영) |
| 로그인·회원가입 | `index.html` 탭 + `assets/owner.js`. 가입 후 승인 대기, 관리자(A)가 앱에서 승인해야 데이터 접근 | **공유 면접일정 + 가입 승인 완료 (DB 마이그레이션 반영)** |
| `README.md` (이 폴더) | 서비스 소개, 화면 3개, 규칙 표, 실행 방법, 평가 기준 대응, 교안 1~8 반영, 진행 과정, 회고 | 완료 |
| `retrospective.md` | 회고: 왜 골랐나 / 자른 것 / 막힌 곳 3개 / AI 활용 / 다음 한 걸음 / 교안 질문 답 | 완료 |
| `docs/api.md` | API 서버(Supabase PostgREST)·표 API·토큰 함수 4개·오류·상태 코드 | 완료 |
| `docs/demo-script.md` | 3분 시연 대본(0:00~3:00)과 비상 멘트 | 완료 |
| `package.json` · `scripts/test-rules.mjs` | `npm run test:rules`: 실제 Supabase에 R1~R9 시험, 시험 데이터 정리, 결과를 `docs/evidence-live-rules.txt`에 기록 | 실제 Supabase 시험 **21/21 통과** (2026-11-03) |
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
1. **(사용자)** Supabase 프로젝트 생성 → `schema.sql` 실행 → Confirm email 끄기 + **가입 허용 켜기** → 시험용 담당자 A·B 계정 → `.env` 작성 → **Project URL과 공개 키 전달** (비밀 키는 절대 X) — 완료 (2026-11-03)
2. **(공개 값 반영)** `assets/config.js`에 URL·Publishable key 반영 (`d6d88db`)
3. **(시험 완료)** `npm run test:rules` → 실제 Supabase R1~R9 **21/21 통과**, 결과 `docs/evidence-live-rules.txt`, PRD 9장 R1~R9 통과로 기록 (2026-11-03)
4. **(완료)** GitHub Pages 배포 주소에서 3개 화면을 실제로 클릭 검증(헤드리스 Chrome, 테스트 후보 생성 후 삭제) → PRD 9장 성공 조건 1~3 통과로 기록 → 맨 위 README 실행 링크 채우기
   - 기록: `docs/evidence-deploy-ui.txt` (2026-11-03)
   - 확인: 담당자 로그인, 시간 후보 추가+새로고침 유지, 면접관 2명 체크, 후보자 예약, 후보자 2명에게 마감 표시, 담당자 화면에 예약자 이름
5. **공유·승인 업데이트 (이번 작업)**: RLS를 '승인된 회원끼리 공유'로 바꾸고 `members` 승인 흐름을 적용했어요. DB 마이그레이션은 실행됐고, 계정 A는 `admin/active`, 기존 나머지 계정은 `pending` 상태예요.
6. **(사용자)** Supabase Authentication → URL Configuration의 Site URL을 배포 주소(`https://basco-git.github.io/aiffel-work/interview-booking/`)로 설정
7. 마무리: 3분 시연 영상(`docs/demo-script.md` 대로), 제출 전 점검(`submit-check` 스킬), 구글폼에 저장소·배포 URL 제출

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
