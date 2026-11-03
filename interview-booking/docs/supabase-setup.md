# Supabase 설정 순서 (직접 하는 일)

> 10분 정도 걸려요. 비밀번호와 비밀 키는 채팅에 붙여 넣지 마세요.
> 대시보드 메뉴 이름은 바뀔 수 있어요. 안 보이면 비슷한 이름을 찾거나 화면 캡처로 물어보세요.

## 1. 새 프로젝트 만들기
1. https://supabase.com/dashboard 접속 → **New project**
2. 이름: `interview-booking` · Region: **Northeast Asia (Seoul)**
3. Database Password: 자동 생성 → 비밀번호 관리자 등에 따로 보관 (채팅·저장소에 넣지 않기)
4. 무료 요금제(Free) 선택 → **Create new project** → 1~2분 기다리기

## 2. 스키마 붙여 넣기 (SQL Editor)
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 저장소의 `interview-booking/supabase/schema.sql` 파일을 열어 **전체 복사** → 붙여 넣기
3. **Run** (Ctrl+Enter)
   - "destructive operation" 경고가 뜨면: 이 파일은 앞부분에서 이 앱의 표를 지우고 다시 만들기 때문이에요. 새 프로젝트이니 **Run this query**를 눌러도 돼요.
   - 성공하면 아래에 `Success. No rows returned`가 보여요.
4. 확인: 왼쪽 **Table Editor**에 `members, positions, interviewers, candidates, slots, availability, bookings` 7개 표가 있고, 각 표에 RLS가 켜져 있으면(경고 표시 없음) 통과예요.

⚠️ 실제 데이터가 생긴 뒤에는 `schema.sql`을 다시 실행하지 마세요. 표를 지우고 다시 만들어요.

## 3. 로그인 설정 (담당자만 로그인해요)
1. **Authentication → Sign In / Providers → Email**: Email이 켜져 있는지 확인
2. 같은 화면의 **Confirm email**을 끄기 (수업 데모용. 확인 메일 없이 바로 가입·로그인돼요)
3. **Allow new users to sign up**을 **켜기** — 화면의 `회원가입` 탭을 쓰려면 필요해요.
   - ⚠️ 가입한 계정은 **승인 대기**가 되고, 관리자가 앱에서 승인하기 전에는 표를 볼 수 없어요. 그래도 남용을 줄이려면 과제가 끝나면 이 옵션을 다시 끄세요(아래 8번).

## 4. 시험용 담당자 계정 두 개 만들기 (R6 권한 시험용)
1. **Authentication → Users → Add user → Create new user**
2. 담당자 A: 이메일(예: `hr-a@본인도메인` 또는 실제 받을 수 있는 주소), 비밀번호, **Auto Confirm User 체크**
3. 같은 방법으로 담당자 B 만들기
4. 두 계정의 이메일·비밀번호는 `interview-booking/.env`에 직접 적어요 (`.env.example`을 복사해 이름을 `.env`로 바꾸기). `.env`는 커밋되지 않아요.

## 5. 최초 관리자 지정 (데이터가 이미 있는 프로젝트)
기존에 `schema.sql`을 한 번이라도 실행한 프로젝트라면 `supabase/migrate-shared-members.sql`을 SQL Editor에서 실행하세요.

1. 파일을 열고 **`admin_email text := '';`** 부분의 `''` 안에 계정 A 이메일을 입력해요.
2. 전체 내용을 SQL Editor에 붙여 넣고 **Run**
3. 이 스크립트는 기존 데이터를 지우지 않아요.
   - 기존 승인 계정: 전부 승인 대기
   - 계정 A: `admin` + `active`
   - 이후 A가 앱의 **회원 승인** 목록에서 나머지 계정을 승인하면 함께 볼 수 있어요.

새로운 프로젝트를 만든 경우에도, 가입 화면으로 A가 직접 가입한 뒤 아래 SQL을 한 번 실행해 관리자로 바꿔야 해요.

```sql
update public.members
   set role = 'admin', status = 'active', updated_at = now()
 where email = '계정 A 이메일';
```

## 6. 공개 주소와 공개 키 알려 주기
1. **Project Settings → API Keys**(또는 **Data API**)에서
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **Publishable key** 또는 **anon public** 키
2. 이 두 값은 브라우저에 공개되는 값이라 채팅에 알려 주셔도 돼요.
3. ❌ **secret key / service_role key는 절대 알려 주지 마세요.** 이 앱은 쓰지 않아요.

## 7. (배포 뒤에) 주소 설정
배포 주소가 정해지면 **Authentication → URL Configuration**의 Site URL을 배포 주소로 바꿔요. 이건 배포 단계에서 다시 안내할게요.

## 8. 과제가 끝난 뒤 (보안 정리)
1. **Authentication → Sign In / Providers → Email → Allow new users to sign up** 끄기
2. **Confirm email** 켜기
3. 시험용 담당자 B 계정과 시험 데이터는 남겨도 되지만, 실제 지원자 정보가 들어갔다면 지워요.

