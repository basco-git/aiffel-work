# 인수인계 — 현재 상태와 남은 일

> 마지막 갱신: 2026-11-04 새벽. 새 대화에서는 이 파일부터 읽어요.
> 시작 문장 예: `aiffel-work/interview-booking/docs/handoff.md 읽고 '남은 일' 1번부터 진행해 줘`

## 과제 개요
- 과제: Main Quest 01 「내 서비스 만들기」(교안 8번), **마감 2026-11-04 오전**
- 제출물: 실행 가능한 웹 서비스(저장소·배포 URL), PRD.md, retrospective.md, 3분 이내 시연 영상
- 루브릭: 도메인 연결성 25 · 기능 완성도 25 · AI 활용도 20 · 회고 깊이 15 · 발표/시연 15
- 서비스: 브랜드 **at~once**의 서비스 **interview-booking** — 면접관 2~3명이 링크로 가능 시간을 체크하면 인원이 모인 시간만 후보자에게 열리고, 후보자가 링크로 예약·변경. 담당자는 가입 → 관리자 승인 뒤 전원이 일정을 공유

## 현재 상태 (모두 확인함)
| 항목 | 상태 |
|---|---|
| 배포 | https://basco-git.github.io/aiffel-work/interview-booking/ — 담당자·면접관·후보자 화면 HTTP 200 |
| Git | 브랜치 `interview-booking`, PR #24까지 main 병합. 이후 변경은 새 PR로 |
| 맨 위 README | 9번 행(실행·폴더 링크) 있음 |
| 실제 규칙 시험 | `npm run test:rules` **26/26 통과** (R1~R9, R6는 공유·승인·계정 삭제 규칙 8개, 2026-11-04) → `docs/evidence-live-rules.txt`, PRD 9장 반영 |
| 배포 화면 검증 | 성공 조건 1~3 통과 → `docs/evidence-deploy-ui.txt` |
| 비밀값 | `config.js`에 공개 키만, `.env`·`node_modules` 미추적, 추적 파일 35개에서 비밀 키 패턴 없음 |
| 문서 | PRD(10·11장 화면·데이터 포함), design, api, demo-script, retrospective, progress, supabase-setup |
| 로컬 시험 | `supabase/local-test/`는 공유 전 스키마(3178acc) 기준 기록. 지금 기준은 실제 시험 |

## 시험 계정 (.env, 커밋 안 함)
A = 관리자(active/admin), B = 일반 승인 회원, C = 승인 대기(R6 시험용). 시험 스크립트가 시작할 때 B 승인·C 대기로 맞추고 끝나면 원래 상태로 되돌려요.

## 남은 일
1. 제출 양식에 저장소·배포 URL 제출 (시연은 README의 상황별 캡처 8장으로 대체)
2. 제출 뒤 보안 정리: `docs/supabase-setup.md` 8번(가입 허용 끄기, Confirm email 켜기)
3. 이후 작업은 `git switch main` → `git pull` → 새 브랜치에서

## 끝난 일 (2026-11-04)
- PR #25 병합, 제출 전 점검 5개 통과
- 상황별 캡처 8장 `docs/screenshots/` + README 시연 장
- 회고 재구성(AI 도구별 흐름, 포지션 상세 오류 사례), README 진행 과정·회고 요약 갱신

## 바꾸지 않을 결정 (사용자)
주제·폴더명, 면접 길이 15분 단위, 면접관 2~3명, SQL Editor 붙여 넣기 방식(MCP 안 씀), AGENTS.md 규칙 + CLAUDE.md 연결, 단계마다 커밋과 진행 기록, 승인 회원 공유·승인 취소는 데이터 유지 + 접근 차단, 사용량 절약(서브에이전트 안 씀)
