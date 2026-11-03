-- =====================================================================
-- 면접 한 번에 (interview-booking) — Supabase 스키마
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여 넣기 → Run
-- 여러 번 실행해도 되게 만들었어요(앞부분에서 기존 객체를 지우고 다시 만들어요).
-- 주의: 다시 실행하면 이 앱의 표와 데이터가 모두 지워져요. 실제 데이터가 생긴 뒤에는 실행하지 마세요.
--
-- 규칙과 막는 곳 (PRD.md 5장)
--   R1 한 시간에 후보자 한 명      → bookings.slot_id UNIQUE + book_slot()의 슬롯 행 잠금
--   R2 후보자 링크 하나에 예약 하나 → bookings.candidate_id UNIQUE (다시 고르면 '변경'으로 처리)
--   R3 면접관 부족 시간 예약 불가   → book_slot()이 가능 면접관 수 확인
--   R4 예약된 시간 체크 해제 불가   → set_availability()가 예약 여부 확인 (같은 슬롯 행 잠금)
--   R5 지난 시간 예약 불가          → book_slot()이 시작 시각 확인
--   R6 담당자 데이터는 그 담당자만  → 모든 표에 RLS, 소유자만 읽기·쓰기
--   R7 링크로는 자기 것만           → 링크 사용자(anon)는 표에 직접 접근 불가, 토큰을 받는 함수로만
--   R9 시간 겹침 금지·15분 단위     → slots 배제 제약(EXCLUDE) + CHECK
-- =====================================================================

create extension if not exists btree_gist;

-- 다시 실행할 때를 위한 정리
drop function if exists public.interviewer_view(uuid);
drop function if exists public.set_availability(uuid, uuid, boolean);
drop function if exists public.candidate_view(uuid);
drop function if exists public.book_slot(uuid, uuid);
drop function if exists public.slot_set_end() cascade;
drop table if exists public.bookings, public.availability, public.slots,
  public.candidates, public.interviewers, public.positions cascade;

-- ---------------------------------------------------------------------
-- 표
-- ---------------------------------------------------------------------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  required_interviewers int not null default 2 check (required_interviewers in (2, 3)),
  created_at timestamptz not null default now()
);

create table public.interviewers (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 30
    check (duration_min between 15 and 120 and duration_min % 15 = 0),   -- R9 15분 단위
  ends_at timestamptz not null,                                        -- 트리거가 채워요
  created_at timestamptz not null default now(),
  constraint slots_no_overlap exclude using gist (                      -- R9 겹침 금지
    position_id with =, tstzrange(starts_at, ends_at) with &&)
);

create table public.availability (
  slot_id uuid not null references public.slots(id) on delete cascade,
  interviewer_id uuid not null references public.interviewers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, interviewer_id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.slots(id) on delete cascade,           -- R1
  candidate_id uuid not null unique references public.candidates(id) on delete cascade, -- R2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.interviewers (position_id);
create index on public.candidates (position_id);
create index on public.availability (interviewer_id);

-- 끝 시각은 시작 + 길이로 늘 다시 계산해요(사용자가 보낸 값은 무시)
create function public.slot_set_end() returns trigger
language plpgsql set search_path = public as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);
  return new;
end $$;

create trigger slots_set_end before insert or update of starts_at, duration_min
  on public.slots for each row execute function public.slot_set_end();

-- ---------------------------------------------------------------------
-- 권한: 담당자(로그인)는 RLS로 자기 것만, 링크 사용자(anon)는 표에 직접 못 들어와요 (R6·R7)
-- ---------------------------------------------------------------------
alter table public.positions    enable row level security;
alter table public.interviewers enable row level security;
alter table public.candidates   enable row level security;
alter table public.slots        enable row level security;
alter table public.availability enable row level security;
alter table public.bookings     enable row level security;

revoke all on public.positions, public.interviewers, public.candidates,
  public.slots, public.availability, public.bookings from anon, authenticated;
grant select, insert, update, delete on public.positions, public.interviewers,
  public.candidates, public.slots to authenticated;
grant select, delete on public.availability, public.bookings to authenticated;  -- 체크·예약은 함수로만

create policy "본인 포지션" on public.positions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "본인 포지션의 면접관" on public.interviewers for all to authenticated
  using (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()));

create policy "본인 포지션의 후보자" on public.candidates for all to authenticated
  using (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()));

create policy "본인 포지션의 시간" on public.slots for all to authenticated
  using (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.positions p where p.id = position_id and p.owner_id = auth.uid()));

create policy "본인 포지션의 가능 체크 보기" on public.availability for select to authenticated
  using (exists (select 1 from public.slots s join public.positions p on p.id = s.position_id
                 where s.id = slot_id and p.owner_id = auth.uid()));

create policy "본인 포지션의 예약 보기" on public.bookings for select to authenticated
  using (exists (select 1 from public.slots s join public.positions p on p.id = s.position_id
                 where s.id = slot_id and p.owner_id = auth.uid()));

create policy "본인 포지션의 예약 취소" on public.bookings for delete to authenticated
  using (exists (select 1 from public.slots s join public.positions p on p.id = s.position_id
                 where s.id = slot_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 링크용 함수 (security definer: 함수 안에서만 표에 닿고, 토큰으로 자기 것만 다뤄요)
-- 오류 메시지는 화면에 그대로 보여 줄 수 있게 한국어로 써요.
-- ---------------------------------------------------------------------

-- 면접관 화면: 포지션, 내 이름, 시간 목록(내 체크 여부, 예약 여부). 다른 사람 이름은 주지 않아요.
create function public.interviewer_view(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_iv public.interviewers; v_pos public.positions;
begin
  select * into v_iv from public.interviewers where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_iv.position_id;
  return json_build_object(
    'position', v_pos.title,
    'name', v_iv.name,
    'slots', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'duration_min', s.duration_min,
        'mine', exists (select 1 from public.availability a where a.slot_id = s.id and a.interviewer_id = v_iv.id),
        'booked', exists (select 1 from public.bookings b where b.slot_id = s.id),
        'past', s.starts_at <= now()
      ) order by s.starts_at)
      from public.slots s where s.position_id = v_iv.position_id), '[]'::json));
end $$;

-- 면접관 체크 바꾸기 (R4: 예약된 시간은 해제 불가)
create function public.set_availability(p_token uuid, p_slot uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_iv public.interviewers; v_slot public.slots;
begin
  select * into v_iv from public.interviewers where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  -- 같은 슬롯의 예약과 동시에 일어나지 않게 슬롯 행을 잠가요
  select * into v_slot from public.slots where id = p_slot and position_id = v_iv.position_id for update;
  if not found then raise exception '이 포지션의 시간이 아니에요.'; end if;           -- R7
  if p_available then
    insert into public.availability (slot_id, interviewer_id) values (p_slot, v_iv.id)
      on conflict do nothing;
  else
    if exists (select 1 from public.bookings where slot_id = p_slot) then            -- R4
      raise exception '이미 예약된 시간이라 해제할 수 없어요. 담당자에게 문의해 주세요.';
    end if;
    delete from public.availability where slot_id = p_slot and interviewer_id = v_iv.id;
  end if;
end $$;

-- 후보자 화면: 포지션, 내 이름, 시간별 열림/마감, 내 예약. 면접관·다른 후보자 이름은 주지 않아요.
create function public.candidate_view(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_c public.candidates; v_pos public.positions; v_my uuid;
begin
  select * into v_c from public.candidates where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_c.position_id;
  select slot_id into v_my from public.bookings where candidate_id = v_c.id;
  return json_build_object(
    'position', v_pos.title,
    'name', v_c.name,
    'my_slot', v_my,
    'slots', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'duration_min', s.duration_min,
        'status', case
          when s.id = v_my then 'mine'
          when exists (select 1 from public.bookings b where b.slot_id = s.id) then 'booked'
          when s.starts_at <= now() then 'past'
          when (select count(*) from public.availability a where a.slot_id = s.id) < v_pos.required_interviewers then 'closed'
          else 'open' end
      ) order by s.starts_at)
      from public.slots s where s.position_id = v_c.position_id
        -- 면접관이 모이지 않은 시간은 아예 보여 주지 않아요
        and (s.id = v_my or (select count(*) from public.availability a where a.slot_id = s.id) >= v_pos.required_interviewers)
    ), '[]'::json));
end $$;

-- 후보자 예약 (처음이면 예약, 이미 있으면 변경). R1·R2·R3·R5
create function public.book_slot(p_token uuid, p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c public.candidates; v_pos public.positions; v_slot public.slots; v_old uuid;
begin
  select * into v_c from public.candidates where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_c.position_id;
  -- 같은 슬롯을 노리는 다른 예약·체크 해제가 끝날 때까지 기다리게 슬롯 행을 잠가요 (R1·R4)
  select * into v_slot from public.slots where id = p_slot and position_id = v_c.position_id for update;
  if not found then raise exception '이 포지션의 시간이 아니에요.'; end if;           -- R7
  if v_slot.starts_at <= now() then raise exception '이미 지난 시간이에요.'; end if;   -- R5
  if (select count(*) from public.availability where slot_id = p_slot) < v_pos.required_interviewers then
    raise exception '면접관 일정이 모이지 않은 시간이에요.';                          -- R3
  end if;
  if exists (select 1 from public.bookings where slot_id = p_slot and candidate_id <> v_c.id) then
    raise exception '방금 다른 분이 예약했어요. 다른 시간을 골라 주세요.';            -- R1
  end if;
  select slot_id into v_old from public.bookings where candidate_id = v_c.id;
  if v_old = p_slot then return; end if;
  if v_old is null then
    insert into public.bookings (slot_id, candidate_id) values (p_slot, v_c.id);
  else
    update public.bookings set slot_id = p_slot, updated_at = now() where candidate_id = v_c.id;  -- 변경(R2)
  end if;
exception when unique_violation then
  raise exception '방금 다른 분이 예약했어요. 다른 시간을 골라 주세요.';              -- R1 최후 방어
end $$;

revoke all on function public.interviewer_view(uuid), public.set_availability(uuid, uuid, boolean),
  public.candidate_view(uuid), public.book_slot(uuid, uuid) from public;
grant execute on function public.interviewer_view(uuid), public.set_availability(uuid, uuid, boolean),
  public.candidate_view(uuid), public.book_slot(uuid, uuid) to anon, authenticated;
revoke all on function public.slot_set_end() from public, anon, authenticated;
