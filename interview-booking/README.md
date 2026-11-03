# 면접 한 번에 (interview-booking)

> **면접관 2~3명의 일정이 모인 시간만 후보자에게 열리는 면접 예약 페이지.**
> HR 15년 경력에서 출발한 불편 — 면접 한 건을 잡으려고 메일·메신저를 여러 번 오가고, 시간이 바뀌면 처음부터 다시 조율하고, 같은 시간에 두 후보자가 겹치는 일 — 을 줄이는 서비스예요.

- 배포 주소: **배포 예정** (GitHub Pages, PR 병합 뒤 `https://basco-git.github.io/aiffel-work/interview-booking/`)
- 기획 문서: [PRD.md](PRD.md) · 설계 이유: [docs/design.md](docs/design.md) · API: [docs/api.md](docs/api.md)
- 회고: [retrospective.md](retrospective.md) · 진행 기록: [docs/progress.md](docs/progress.md)

## 누가 쓰나

| 사용자 | 들어오는 방법 | 하는 일 |
|---|---|---|
| 인사담당자 | 로그인 | 포지션·시간 후보를 만들고, 링크를 전달하고, 현황을 본다 |
| 면접관 (2~3명) | 개인 링크 (로그인 없음) | 가능한 시간을 체크한다 |
| 후보자 | 개인 링크 (로그인 없음) | 열린 시간 중 하나를 예약하거나 바꾼다 |

## 화면 3개

| 화면 | 주소 | 내용 |
|---|---|---|
| 담당자 | `index.html` | 회원가입·로그인, 포지션(필요 면접관 2·3), 면접관·후보자 추가와 **링크 복사**, 시간 후보(15분 단위), 시간별 가능 인원·예약자, 예약 취소 |
| 면접관 | `interviewer.html?t=토큰` | 시간 목록에서 가능 체크. 예약된 시간은 잠김 |
| 후보자 | `candidate.html?t=토큰` | 열린 시간만 보이고 예약·변경. 면접관 이름은 보이지 않음 |

## 규칙은 화면이 아니라 DB가 지킨다

| # | 규칙 | 막는 곳 |
|---|---|---|
| R1 | 한 시간에 후보자 한 명 | `bookings.slot_id` 고유 + 예약 함수가 슬롯 행 잠금 |
| R2 | 링크 하나에 예약 하나 (다시 고르면 변경) | `bookings.candidate_id` 고유 |
| R3 | 면접관이 모자란 시간은 예약 불가 | 예약 함수가 가능 인원 확인, 후보자 화면에서도 숨김 |
| R4 | 예약된 시간은 면접관이 해제 불가 | 체크 함수가 예약 여부 확인 |
| R5 | 지난 시간 예약 불가 | 예약 함수가 시작 시각 확인 |
| R6 | 담당자는 자기 것만 | 6개 표 모두 RLS |
| R7 | 링크로는 자기 것만 | anon은 표 접근 불가, 토큰 함수 4개로만 |
| R8 | 비밀값은 코드·저장소에 없음 | `.env`는 `.gitignore`, 브라우저엔 공개 키만 |
| R9 | 시간 겹침 금지·15분 단위 | `slots` 배제 제약(EXCLUDE) + CHECK |

자세한 내용과 규칙별 시험 방법은 [PRD.md](PRD.md) 5장에 있어요.

## 구조

```
interview-booking/
├─ index.html · interviewer.html · candidate.html   화면 3개
├─ assets/
│  ├─ config.js      Supabase Project URL·공개 키 (공개 값만)
│  ├─ app.js         연결·한국 시간 표시·알림·링크 복사
│  ├─ owner.js · interviewer.js · candidate.js      화면별 동작
│  └─ styles.css
├─ supabase/
│  ├─ schema.sql     표 6개·RLS·토큰 함수 4개 (SQL Editor에 붙여 넣어 실행)
│  └─ local-test/    로컬 PostgreSQL에서 규칙 19개를 시험하는 스크립트
├─ scripts/test-rules.mjs   실제 Supabase에 R1~R9를 시험 (npm run test:rules)
├─ docs/             설계·API·설정 순서·진행 기록·시험 결과
├─ PRD.md · retrospective.md
```

## 실행 방법

```bash
# 1) Supabase 설정 (10분): docs/supabase-setup.md
# 2) 화면 설정: assets/config.js 의 SUPABASE_URL, SUPABASE_ANON_KEY 두 줄 채우기 (공개 키만)
# 3) 정적 파일이라 빌드가 없어요. 아무 정적 서버로 열면 됩니다.
npx serve .
# 4) 실제 DB로 규칙 시험 (선택)
npm install
cp .env.example .env   # 시험용 담당자 A·B 계정과 URL·공개 키
npm run test:rules
```

## 평가 기준 대응

| 기준 | 어디에 있나 |
|---|---|
| 1. PRD로 기획 | [PRD.md](PRD.md) — 문제(1장)·타겟 유저(2장)·MVP Must 3(4장)·화면 구성(10장)·데이터 구조(11장) |
| 2. 프론트엔드 (2개 이상 화면) | 화면 3개. 체크·예약·취소가 서버에 저장되고 다시 그려지는 흐름. 담당자 회원가입·로그인 |
| 3. 백엔드/API | Supabase(PostgREST)를 API 서버로 사용, 업무 규칙은 SQL 함수 4개(`interviewer_view`, `set_availability`, `candidate_view`, `book_slot`) — 요청·응답·오류는 [docs/api.md](docs/api.md) |
| 4. DB 연동 | PostgreSQL 표 6개, 1:N·N:M·1:1, RLS, 배제 제약, 저장·조회 흐름 전부 화면과 연결 |
| 5. 배포·새로운 시도 | GitHub Pages 배포(진행 예정) · **규칙을 DB에서 강제**(화면 우회 차단) · 회원가입·로그인으로 담당자별 데이터 분리 · 동시 예약 10건 시험 · AGENTS.md 규칙 파일과 Claude Code 스킬로 작업 자동화 · 모바일 대응 |

## 교안 1~8 반영

| 교안 | 이 과제에서 한 것 | 증거 |
|---|---|---|
| 1 개발 환경 | Claude Code 작업대, 위험한 작업은 계획 먼저·승인 후 실행 | `AGENTS.md` |
| 2 Git | 브랜치 `interview-booking`, 확인한 것만 커밋, main에는 PR로 | `git log`, `docs/progress.md` |
| 3 세 겹 | HTML 구조·CSS·JS 동작을 나눠 화면 3개 | `index.html`, `assets/` |
| 4 프레임워크 | 프레임워크 채택·기각 비교와 이유 | `docs/design.md` 1장 |
| 5 백엔드·DB | 표 6개 설계, RLS, `.env`, 파라미터 대신 토큰 함수 | `supabase/schema.sql` |
| 6 네트워크·배포 | 공개 URL 배포, 요청·응답·상태 코드 정리, 입력 검증 | `docs/api.md` |
| 7 에이전트 도구 | `AGENTS.md`·`CLAUDE.md` 규칙, 스킬(submit-check·evidence-capture·assignment-wrapup) | `AGENTS.md`, `CLAUDE.md` |
| 8 메인 퀘스트 | 한 문장, Must 3·Won't 6, DB가 지키는 규칙 R1~R9, 검증 기록, 회고, 시연 | `PRD.md` 9장 |

## 진행 과정

| 순서 | 한 일 | 결과 |
|---|---|---|
| 1 | 주제 후보 3개 비교 (면접 일정 예약 / 1on1 피드백 / 강아지 호흡수) | HR 경력과 연결되는 **면접 일정 예약** 선택 |
| 2 | PRD 초안 → 현업 의견 반영 | 면접 15분 단위, 면접관 2~3명 일정 포함, R1~R9 확정 (`721d8de`) |
| 3 | 기술 후보 3개 비교 (Supabase+정적 / Node+SQLite / Firebase) | Supabase + 정적 화면 채택, 이유는 `docs/design.md` (`3178acc`) |
| 4 | DB 스키마 6표 + RLS + 토큰 함수 4개 | 로컬 PostgreSQL에서 규칙 시험 **19/19 통과**, 동시 예약 10건 중 1건 성공 (`3178acc`) |
| 5 | 화면 3개 구현 | 담당자·면접관·후보자 화면, 예약·체크·취소 흐름 (`4513054`) |
| 6 | 실제 Supabase에 규칙 시험 | `npm run test:rules` — **완료: R1~R9 21/21 통과** (2026-11-03, `docs/evidence-live-rules.txt`) |
| 7 | 배포·다른 기기에서 한 바퀴 | **진행 예정** (PR 병합 뒤 GitHub Pages) |

## 회고

- **범위를 먼저 잘랐음** → 구글 캘린더 연동·메일 자동 발송·평가표를 Won't로 두고, "일정이 모인 시간만 열린다" 하나에 집중함. 덕분에 하루 안에 DB 규칙까지 갈 수 있었음.
- **규칙을 화면이 아니라 DB에 둠** → 화면 코드를 우회한 요청도 막히는 것을 로컬 시험 19개로 확인함. 대신 SQL 함수가 읽기 어려워져 함수마다 막는 규칙을 주석으로 답.
- **시험이 엉뚱한 이유로 통과한 일** → 한글 인코딩·`\r` 문제로 "거부됨"이 통과로 찍혔음. 기대한 오류 문구가 있을 때만 통과로 바꾸니 진짜 결과가 보였음.
- **AI에게 맡긴 일과 직접 확인한 일** → 화면·스키마·시험 스크립트는 AI가 썼고, PRD 결정과 Supabase 프로젝트 생성·계정은 직접 함. AI가 "됐다"고 한 것도 실제 요청 결과로 다시 확인해야 했음.
- **다음에 다르게 할 점** → Supabase 프로젝트를 첫날 먼저 만들었으면 실제 DB 시험을 더 일찍 했을 것. 이번엔 화면을 가짜 데이터로만 확인해 실제 연결 검증이 뒤로 밀림.

자세한 회고는 [retrospective.md](retrospective.md)에 있어요.
