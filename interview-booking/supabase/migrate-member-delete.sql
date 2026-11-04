-- =====================================================================
-- 기존 Supabase 프로젝트에 "승인 취소 뒤 계정 삭제(퇴사자)"를 적용하는 마이그레이션
-- 실행 대상: migrate-shared-members.sql까지 적용된 프로젝트
-- 실행 방법: SQL Editor → New query → 전체를 붙여 넣고 Run (여러 번 실행해도 안전)
--
-- 기존 포지션·면접관·후보자·예약 데이터는 지우지 않아요.
-- 바뀌는 것
--   1) 포지션을 만든 계정이 지워져도 포지션이 남도록 owner_id 연결을
--      "같이 삭제(cascade)" → "비워 두기(set null)"로 바꿔요.
--   2) 관리자만 쓸 수 있는 계정 삭제 함수 delete_member를 추가해요.
--      승인 취소된(rejected) 일반 회원만 지울 수 있어요.
-- =====================================================================

-- 1) 포지션 소유자 연결: 계정이 지워지면 owner_id만 비워요
alter table public.positions alter column owner_id drop not null;
alter table public.positions drop constraint if exists positions_owner_id_fkey;
alter table public.positions
  add constraint positions_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

-- 2) 계정 삭제 함수 (관리자 전용, 승인 취소된 일반 회원만)
create or replace function public.delete_member(target uuid) returns void
language plpgsql security definer set search_path = public set row_security = off as $$
declare
  m public.members;
begin
  if not public.is_admin() then
    raise exception '관리자만 회원을 삭제할 수 있어요.';
  end if;
  if target = auth.uid() then
    raise exception '내 계정은 삭제할 수 없어요.';
  end if;
  select * into m from public.members where user_id = target;
  if not found then
    raise exception '회원을 찾을 수 없어요.';
  end if;
  if m.role = 'admin' then
    raise exception '관리자 계정은 삭제할 수 없어요.';
  end if;
  if m.status <> 'rejected' then
    raise exception '승인 취소된 계정만 삭제할 수 있어요. 먼저 승인 취소해 주세요.';
  end if;
  -- 로그인 계정을 지우면 members 행도 함께 지워지고, 포지션은 owner_id만 비워져 남아요.
  delete from auth.users where id = target;
end $$;

revoke all on function public.delete_member(uuid) from public, anon, authenticated;
grant execute on function public.delete_member(uuid) to authenticated;
