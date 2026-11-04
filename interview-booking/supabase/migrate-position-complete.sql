-- =====================================================================
-- 기존 Supabase 프로젝트에 "포지션 채용 완료 + 완료된 면접 기록"을 적용하는 마이그레이션
-- 실행 대상: migrate-member-delete.sql까지 적용된 프로젝트
-- 실행 방법: SQL Editor → New query → 전체를 붙여 넣고 Run (여러 번 실행해도 안전)
--
-- 기존 데이터는 지우지 않아요.
-- 바뀌는 것
--   1) positions에 completed_at(채용 완료 시각) 칸 추가. 비어 있으면 진행 중이에요.
--   2) 완료된 포지션은 면접관 가능 체크·후보자 예약을 서버에서 거부해요(R10).
--   3) 면접관·후보자 화면 함수가 완료 여부(completed)를 함께 돌려줘요.
-- 함수 권한(grant)은 기존 그대로 유지돼요(create or replace는 권한을 바꾸지 않아요).
-- =====================================================================

alter table public.positions add column if not exists completed_at timestamptz;

create or replace function public.interviewer_view(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_iv public.interviewers; v_pos public.positions;
begin
  select * into v_iv from public.interviewers where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_iv.position_id;
  return json_build_object(
    'position', v_pos.title,
    'completed', v_pos.completed_at is not null,
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

create or replace function public.set_availability(p_token uuid, p_slot uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_iv public.interviewers; v_slot public.slots;
begin
  select * into v_iv from public.interviewers where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  if exists (select 1 from public.positions where id = v_iv.position_id and completed_at is not null) then
    raise exception '채용이 끝난 포지션이에요. 담당자에게 문의해 주세요.';           -- R10
  end if;
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

create or replace function public.candidate_view(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_c public.candidates; v_pos public.positions; v_my uuid;
begin
  select * into v_c from public.candidates where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_c.position_id;
  select slot_id into v_my from public.bookings where candidate_id = v_c.id;
  return json_build_object(
    'position', v_pos.title,
    'completed', v_pos.completed_at is not null,
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

create or replace function public.book_slot(p_token uuid, p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c public.candidates; v_pos public.positions; v_slot public.slots; v_old uuid;
begin
  select * into v_c from public.candidates where token = p_token;
  if not found then raise exception '링크가 올바르지 않아요.'; end if;
  select * into v_pos from public.positions where id = v_c.position_id;
  if v_pos.completed_at is not null then
    raise exception '채용이 끝난 포지션이에요. 담당자에게 문의해 주세요.';           -- R10
  end if;
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
