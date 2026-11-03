-- =====================================================================
-- 기존 Supabase 프로젝트에 "승인 회원 공유 + 가입 승인"을 적용하는 마이그레이션
-- 실행 대상: 이미 interview-booking 스키마(schema.sql)가 있는 프로젝트
-- 실행 방법: SQL Editor → New query → `admin_email text := '';` 한 줄의
--            '' 안에 계정 A 이메일 입력 → 전체를 붙여 넣고 Run
--
-- 이 스크립트는 기존 포지션·면접관·후보자·예약 데이터를 지우지 않아요.
-- 대신 기존 계정은 모두 "승인 대기"가 되고, 아래에서 지정한 계정 A만
-- 관리자(admin)이자 active로 설정해요.
-- =====================================================================

-- 1) 승인 회원 표
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 가입할 때 자동으로 승인 대기 회원을 만들어요
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, email, role, status)
  values (new.id, lower(coalesce(new.email, '')), 'member', 'pending')
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 3) 승인 여부 검사 함수 (RLS 재귀 방지)
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- 기존 가입자는 전부 승인 대기로 넣고, 계정 A만 관리자·active로 둡니다.
-- 계정 A 이메일 한 줄만 넣어 주세요.
-- 바꾸기 전에는 SQL Editor가 오류로 멈추므로 안전합니다.
insert into public.members (user_id, email, role, status)
select id, lower(email), 'member', 'pending'
from auth.users
on conflict (user_id) do nothing;

do $$
declare
  admin_email text := '';
  changed_count integer;
begin
  if admin_email = '' then
    raise exception '계정 A 이메일을 admin_email 한 줄에 넣은 뒤 다시 실행하세요.';
  end if;

  update public.members
     set role = 'admin', status = 'active', updated_at = now()
   where user_id = (select id from auth.users where lower(email) = lower(admin_email));

  get diagnostics changed_count = row_count;
  if changed_count = 0 then
    raise exception '계정 A 이메일을 auth.users에서 찾지 못했어요: %', admin_email;
  end if;
end $$;

-- 4) 표 접근 권한
alter table public.members enable row level security;

revoke all on public.members, public.positions, public.interviewers, public.candidates,
  public.slots, public.availability, public.bookings from anon, authenticated;
grant select, update on public.members to authenticated;
grant select, insert, update, delete on public.positions, public.interviewers,
  public.candidates, public.slots to authenticated;
grant select, delete on public.availability, public.bookings to authenticated;

-- 5) 기존 정책 제거
drop policy if exists "회원 본인 또는 관리자만 상태 보기" on public.members;
drop policy if exists "관리자만 회원 승인·역할 변경" on public.members;

drop policy if exists "본인 포지션" on public.positions;
drop policy if exists "승인 회원 전체 포지션 보기" on public.positions;
drop policy if exists "승인 회원 전체 포지션 만들기" on public.positions;
drop policy if exists "승인 회원 전체 포지션 수정" on public.positions;
drop policy if exists "관리자만 포지션 삭제" on public.positions;

drop policy if exists "본인 포지션의 면접관" on public.interviewers;
drop policy if exists "승인 회원 전체 면접관 보기" on public.interviewers;
drop policy if exists "승인 회원 전체 면접관 만들기" on public.interviewers;
drop policy if exists "승인 회원 전체 면접관 수정" on public.interviewers;
drop policy if exists "승인 회원 전체 면접관 삭제" on public.interviewers;

drop policy if exists "본인 포지션의 후보자" on public.candidates;
drop policy if exists "승인 회원 전체 후보자 보기" on public.candidates;
drop policy if exists "승인 회원 전체 후보자 만들기" on public.candidates;
drop policy if exists "승인 회원 전체 후보자 수정" on public.candidates;
drop policy if exists "승인 회원 전체 후보자 삭제" on public.candidates;

drop policy if exists "본인 포지션의 시간" on public.slots;
drop policy if exists "승인 회원 전체 시간 보기" on public.slots;
drop policy if exists "승인 회원 전체 시간 만들기" on public.slots;
drop policy if exists "승인 회원 전체 시간 수정" on public.slots;
drop policy if exists "관리자만 시간 삭제" on public.slots;

drop policy if exists "본인 포지션의 가능 체크 보기" on public.availability;
drop policy if exists "승인 회원 전체 가능 체크 보기" on public.availability;

drop policy if exists "본인 포지션의 예약 보기" on public.bookings;
drop policy if exists "승인 회원 전체 예약 보기" on public.bookings;

drop policy if exists "본인 포지션의 예약 취소" on public.bookings;
drop policy if exists "승인 회원 전체 예약 취소" on public.bookings;

-- 6) 새 정책: 승인 회원끼리는 일정을 공유하고, 회원 관리는 관리자만
create policy "회원 본인 또는 관리자만 상태 보기" on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "관리자만 회원 승인·역할 변경" on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "승인 회원 전체 포지션 보기" on public.positions for select to authenticated
  using (public.is_active_member());
create policy "승인 회원 전체 포지션 만들기" on public.positions for insert to authenticated
  with check (public.is_active_member());
create policy "승인 회원 전체 포지션 수정" on public.positions for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy "관리자만 포지션 삭제" on public.positions for delete to authenticated
  using (public.is_admin());

create policy "승인 회원 전체 면접관 보기" on public.interviewers for select to authenticated
  using (public.is_active_member());
create policy "승인 회원 전체 면접관 만들기" on public.interviewers for insert to authenticated
  with check (public.is_active_member());
create policy "승인 회원 전체 면접관 수정" on public.interviewers for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy "승인 회원 전체 면접관 삭제" on public.interviewers for delete to authenticated
  using (public.is_active_member());

create policy "승인 회원 전체 후보자 보기" on public.candidates for select to authenticated
  using (public.is_active_member());
create policy "승인 회원 전체 후보자 만들기" on public.candidates for insert to authenticated
  with check (public.is_active_member());
create policy "승인 회원 전체 후보자 수정" on public.candidates for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy "승인 회원 전체 후보자 삭제" on public.candidates for delete to authenticated
  using (public.is_active_member());

create policy "승인 회원 전체 시간 보기" on public.slots for select to authenticated
  using (public.is_active_member());
create policy "승인 회원 전체 시간 만들기" on public.slots for insert to authenticated
  with check (public.is_active_member());
create policy "승인 회원 전체 시간 수정" on public.slots for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy "관리자만 시간 삭제" on public.slots for delete to authenticated
  using (public.is_admin());

create policy "승인 회원 전체 가능 체크 보기" on public.availability for select to authenticated
  using (public.is_active_member());

create policy "승인 회원 전체 예약 보기" on public.bookings for select to authenticated
  using (public.is_active_member());

create policy "승인 회원 전체 예약 취소" on public.bookings for delete to authenticated
  using (public.is_active_member());
