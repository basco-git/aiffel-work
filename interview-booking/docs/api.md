# API 문서 — 면접 한 번에

> 화면은 프레임워크 없는 정적 HTML·JS이고, **API 서버는 Supabase가 맡아요**(PostgREST + PostgreSQL 함수).
> 브라우저는 공개 키와 로그인 세션으로 호출하고, 규칙 R1~R9는 서버(DB 제약·행 잠금·RLS)에서 막아요.
> 이 문서는 화면이 실제로 부르는 요청만 적었어요.

## 1. 공통

| 항목 | 값 |
|---|---|
| Base URL | `https://<프로젝트>.supabase.co` |
| 표 조회·수정 | `/rest/v1/<표>` (PostgREST) |
| 함수 호출 | `/rest/v1/rpc/<함수>` |
| 로그인 | `/auth/v1/token?grant_type=password` (라이브러리가 처리) |
| 필수 헤더 | `apikey: <공개 키>`, `Authorization: Bearer <세션 토큰>` |
| 응답 형식 | JSON 배열 또는 객체 |

- 담당자 요청은 로그인 세션 토큰을 붙여요. 표에는 RLS가 걸려 있어 **승인된 회원은 전체 일정을 보고 함께 관리하고, 비승인·반려 회원은 접근할 수 없어요**(R6).
- 링크 사용자(면접관·후보자)는 로그인하지 않아요. 표에 직접 접근할 권한이 없고, 아래 **RPC 4개**로만 자기 것을 다뤄요(R7).
- 오류는 PostgREST 형식이에요: `{ "code": "P0001", "message": "이미 지난 시간이에요.", "details": null, "hint": null }`.
  화면은 `message`를 그대로 보여 줘요.

## 2. 담당자 API (로그인 필요)

| 하는 일 | 요청 | 비고 |
|---|---|---|
| 로그인 | `supabase.auth.signInWithPassword({ email, password })` | 실패: `Invalid login credentials` |
| 회원가입 | `supabase.auth.signUp({ email, password })` | 가입 후 **승인 대기** 목록에 들어가요. 관리자가 `active`로 바꾸어야 표를 볼 수 있어요 |
| 포지션 목록 | `GET /rest/v1/positions?select=id,title,required_interviewers&order=created_at.asc` | 승인된 회원은 모두 볼 수 있어요 |
| 포지션 만들기 | `POST /rest/v1/positions` `{ "title": "백엔드 개발자", "required_interviewers": 2 }` | `owner_id` 기본값은 로그인 사용자 |
| 포지션 삭제 | `DELETE /rest/v1/positions?id=eq.<id>` | **관리자만** 가능하고 하위 표까지 함께 지워져요(시험 데이터 정리에 사용) |
| 회원 상태 목록 | `GET /rest/v1/members?select=user_id,email,role,status,created_at&order=created_at.asc` | 관리자는 전체, 일반 회원은 자기 것만 조회 |
| 회원 승인/반려 | `PATCH /rest/v1/members?user_id=eq.<id>` `{ "status": "active" }` | 관리자만, `active`·`rejected`로 변경 |
| 면접관 목록·추가 | `GET /rest/v1/interviewers?position_id=eq.<id>&select=id,name,token` / `POST` `{ position_id, name }` | `token`은 자동 생성(UUID v4) |
| 후보자 목록·추가 | `GET /rest/v1/candidates?...` / `POST` `{ position_id, name }` | 같음 |
| 시간 목록·추가 | `GET /rest/v1/slots?position_id=eq.<id>&order=starts_at.asc` / `POST` `{ position_id, starts_at, duration_min }` | `ends_at`은 트리거가 계산, 겹치면 23P01 |
| 가능 체크 보기 | `GET /rest/v1/availability?slot_id=in.(...)&select=slot_id,interviewer_id,interviewers(name)` | 읽기만 (쓰기는 RPC) |
| 예약 보기 | `GET /rest/v1/bookings?slot_id=in.(...)&select=slot_id,candidate_id,candidates(name)` | 읽기만 |
| 예약 취소 | `DELETE /rest/v1/bookings?slot_id=eq.<id>` | 담당자만, 취소하면 시간이 다시 열려요 |

## 3. 링크 사용자 API (로그인 없음)

### 3.1 `interviewer_view(p_token uuid)`

면접관 링크 화면을 그리는 데 필요한 것만 돌려줘요. 다른 면접관 이름은 주지 않아요.

```json
{
  "position": "백엔드 개발자",
  "name": "김민수",
  "slots": [
    { "id": "…", "starts_at": "2026-11-04T01:00:00+00:00", "ends_at": "2026-11-04T01:30:00+00:00",
      "duration_min": 30, "mine": true, "booked": false, "past": false }
  ]
}
```

- `mine`: 내가 가능으로 체크했는지 · `booked`: 예약이 들어갔는지 · `past`: 지난 시간인지
- 오류: `링크가 올바르지 않아요.`

### 3.2 `set_availability(p_token uuid, p_slot uuid, p_available boolean)` → 없음(void)

가능 체크를 켜고 꺼요. 슬롯 행을 잠그고 예약 여부를 확인해요.

| 상황 | 결과 |
|---|---|
| 성공 | 204, 응답 본문 없음 |
| 예약된 시간을 해제 (R4) | `P0001` · `이미 예약된 시간이라 해제할 수 없어요. 담당자에게 문의해 주세요.` |
| 다른 포지션의 시간 (R7) | `P0001` · `이 포지션의 시간이 아니에요.` |
| 없는 링크 | `P0001` · `링크가 올바르지 않아요.` |

### 3.3 `candidate_view(p_token uuid)`

후보자에게는 **열린 시간만** 보여 줘요. 면접관·다른 후보자 이름은 없어요.

```json
{
  "position": "백엔드 개발자",
  "name": "박지원",
  "my_slot": null,
  "slots": [
    { "id": "…", "starts_at": "2026-11-04T01:00:00+00:00", "ends_at": "2026-11-04T01:30:00+00:00",
      "duration_min": 30, "status": "open" }
  ]
}
```

- `status`: `open`(예약 가능) · `booked`(다른 후보자가 마감) · `mine`(내 예약) · `past`(지난 시간)
- 면접관이 필요 인원만큼 모이지 않은 시간은 목록에 아예 없어요(R3).

### 3.4 `book_slot(p_token uuid, p_slot uuid)` → 없음(void)

처음이면 예약, 이미 예약이 있으면 **변경**해요. 슬롯 행을 잠가 동시 요청을 한 건만 통과시켜요.

| 상황 | 결과 |
|---|---|
| 성공 | 204 |
| 이미 다른 사람이 예약 (R1) | `방금 다른 분이 예약했어요. 다른 시간을 골라 주세요.` |
| 면접관 부족 (R3) | `면접관 일정이 모이지 않은 시간이에요.` |
| 지난 시간 (R5) | `이미 지난 시간이에요.` |
| 다른 포지션 시간 (R7) | `이 포지션의 시간이 아니에요.` |
| 없는 링크 | `링크가 올바르지 않아요.` |

## 4. 상태 코드

| 코드 | 뜻 | 화면 처리 |
|---|---|---|
| 200 / 201 / 204 | 성공 | 결과를 다시 불러와 그려요 |
| 400 `P0001` | 함수가 규칙을 이유로 거부 | `message`를 그대로 보여 줌 |
| 400 `23P01` | 시간 겹침(배제 제약) | "이미 겹치는 시간 후보가 있어요" |
| 400 `23514` | 길이·글자 수 등 검사 위반 | "길이는 15~120분, 15분 단위여야 해요" |
| 401 | 로그인 만료·키 오류 | 다시 로그인 / 키 설정 안내 |
| 403 `42501` | 권한 없음(비로그인 표 접근) | 링크 화면에서 발생하지 않게 설계함 |

## 5. 보안 경계

- 브라우저에는 **공개 키만** 들어가요(`assets/config.js`). 비밀 키(service_role)는 어디에도 쓰지 않아요(R8).
- 표 접근 권한은 `anon`에게 전부 회수했고, `authenticated`도 RLS로 **승인된 회원만** 다뤄요.
- 체크·예약은 `security definer` 함수 안에서 토큰으로 대상을 찾고, 다른 사람 데이터는 반환하지 않아요.
- 링크 토큰은 UUID v4라 추측이 사실상 불가능해요. 링크가 새면 담당자가 그 면접관·후보자를 지우고 새로 만들어요.
