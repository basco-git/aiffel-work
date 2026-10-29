-- Todo 앱 길 B: Supabase(PostgreSQL) 스키마 + RLS
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 한다. 여러 번 실행해도 안전하다.
--
-- 길 A(db/schema.sql)와 같은 구조에 user_id 열을 더했다.
-- 모든 표에 RLS를 켜고, 로그인한 사용자(authenticated)가 user_id = auth.uid() 인 행만
-- 읽고 쓸 수 있게 한다. 로그인하지 않은 요청(anon)에는 어떤 행도 보이지 않는다.

-- ============================================================
-- 1. 표
-- ============================================================

create table if not exists public.todos (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title           text        not null check (length(btrim(title)) > 0 and length(title) <= 200),
  memo            text        check (memo is null or length(memo) <= 2000),
  due_date        date,
  is_done         boolean     not null default false,
  done_at         timestamptz,
  is_today_pick   boolean     not null default false,
  reschedule_cnt  integer     not null default 0 check (reschedule_cnt >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.tags (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0 and length(name) <= 30),
  color       text        not null default '#888888' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.todo_tags (
  todo_id  bigint not null references public.todos (id) on delete cascade,
  tag_id   bigint not null references public.tags (id) on delete cascade,
  user_id  uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (todo_id, tag_id)
);

create table if not exists public.due_history (
  id          bigint generated always as identity primary key,
  todo_id     bigint      not null references public.todos (id) on delete cascade,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  old_due     date,
  new_due     date        not null,
  reason      text        check (reason is null or length(reason) <= 200),
  changed_at  timestamptz not null default now()
);

create index if not exists idx_todos_user_done_due on public.todos (user_id, is_done, due_date);
create index if not exists idx_tags_user           on public.tags (user_id);
create index if not exists idx_todo_tags_tag       on public.todo_tags (tag_id);
create index if not exists idx_todo_tags_user      on public.todo_tags (user_id);
create index if not exists idx_due_history_todo    on public.due_history (todo_id);
create index if not exists idx_due_history_user    on public.due_history (user_id);

-- ============================================================
-- 2. 트리거: 수정 시각, 완료 시각, 마감일 재설정 기록/횟수
-- ============================================================

create or replace function public.todos_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.is_done and not old.is_done then
    new.done_at := now();
  elsif not new.is_done then
    new.done_at := null;
  end if;
  if new.due_date is distinct from old.due_date and new.due_date is not null then
    new.reschedule_cnt := old.reschedule_cnt + 1;
  end if;
  return new;
end $$;

create or replace function public.todos_after_due_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.due_history (todo_id, user_id, old_due, new_due)
  values (new.id, new.user_id, old.due_date, new.due_date);
  return null;
end $$;

drop trigger if exists trg_todos_before_update on public.todos;
create trigger trg_todos_before_update
  before update on public.todos
  for each row execute function public.todos_before_update();

drop trigger if exists trg_todos_due_changed on public.todos;
create trigger trg_todos_due_changed
  after update of due_date on public.todos
  for each row when (new.due_date is distinct from old.due_date and new.due_date is not null)
  execute function public.todos_after_due_change();

-- ============================================================
-- 3. RLS: 본인 행만
-- ============================================================

alter table public.todos       enable row level security;
alter table public.tags        enable row level security;
alter table public.todo_tags   enable row level security;
alter table public.due_history enable row level security;

drop policy if exists "todos_own" on public.todos;
create policy "todos_own" on public.todos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tags_own" on public.tags;
create policy "tags_own" on public.tags for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 연결/기록 표는 본인 소유이면서, 가리키는 할 일·태그도 본인 것이어야 쓸 수 있다
drop policy if exists "todo_tags_own" on public.todo_tags;
create policy "todo_tags_own" on public.todo_tags for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = (select auth.uid()))
  );

drop policy if exists "due_history_own" on public.due_history;
create policy "due_history_own" on public.due_history for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
  );

-- 로그인한 사용자에게만 표 권한을 주고, anon(비로그인)은 막는다
revoke all on public.todos, public.tags, public.todo_tags, public.due_history from anon;
grant select, insert, update, delete
  on public.todos, public.tags, public.todo_tags, public.due_history to authenticated;

-- ============================================================
-- 4. RPC 함수 (security invoker: 호출한 사용자의 RLS가 그대로 적용된다)
-- ============================================================

-- 할 일 목록 (태그 포함). 백엔드가 사용자의 오늘 날짜(p_today)를 넘긴다.
create or replace function public.todo_list(
  p_q          text    default null,
  p_tag        bigint  default null,
  p_status     text    default 'all',
  p_today_only boolean default false,
  p_today      date    default null,
  p_id         bigint  default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.is_done, x.due_date is null, x.due_date, x.id desc), '[]'::jsonb)
  from (
    select t.id, t.is_done, t.due_date,
           to_jsonb(t) - 'user_id' || jsonb_build_object('tags', coalesce((
             select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color) order by g.name)
             from public.todo_tags tt join public.tags g on g.id = tt.tag_id
             where tt.todo_id = t.id), '[]'::jsonb)) as j
    from public.todos t
    where (p_id is null or t.id = p_id)
      and (p_status is null or p_status = 'all'
           or (p_status = 'active' and not t.is_done)
           or (p_status = 'done' and t.is_done))
      and (p_tag is null or exists (
             select 1 from public.todo_tags tt where tt.todo_id = t.id and tt.tag_id = p_tag))
      and (not p_today_only or (not t.is_done and (t.due_date <= p_today or t.is_today_pick)))
      and (p_q is null or p_q = ''
           or strpos(lower(t.title), lower(p_q)) > 0
           or strpos(lower(coalesce(t.memo, '')), lower(p_q)) > 0
           or exists (select 1 from public.todo_tags tt join public.tags g on g.id = tt.tag_id
                      where tt.todo_id = t.id and strpos(lower(g.name), lower(p_q)) > 0))
  ) x;
$$;

-- 할 일의 태그를 통째로 바꾼다
create or replace function public.todo_set_tags(p_todo bigint, p_tags bigint[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.todos where id = p_todo) then
    raise exception 'todo % not found', p_todo using errcode = 'P0002';
  end if;
  delete from public.todo_tags where todo_id = p_todo;
  insert into public.todo_tags (todo_id, tag_id)
  select p_todo, tag_id from (select distinct unnest(coalesce(p_tags, '{}')) as tag_id) s;
end $$;

-- 마감일 재설정 (기록은 트리거가 남기고, 이유만 채운다)
create or replace function public.todo_reschedule(p_todo bigint, p_due date, p_reason text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_old date;
begin
  select due_date into v_old from public.todos where id = p_todo;
  if not found then
    raise exception 'todo % not found', p_todo using errcode = 'P0002';
  end if;
  if v_old is not distinct from p_due then
    raise exception 'same due date' using errcode = 'P0001', hint = 'same_due';
  end if;
  update public.todos set due_date = p_due where id = p_todo;
  if p_reason is not null and p_reason <> '' then
    update public.due_history set reason = p_reason
    where id = (select max(id) from public.due_history where todo_id = p_todo);
  end if;
end $$;

revoke all on function public.todo_list(text, bigint, text, boolean, date, bigint) from public, anon;
revoke all on function public.todo_set_tags(bigint, bigint[])                   from public, anon;
revoke all on function public.todo_reschedule(bigint, date, text)               from public, anon;
grant execute on function public.todo_list(text, bigint, text, boolean, date, bigint) to authenticated;
grant execute on function public.todo_set_tags(bigint, bigint[])                   to authenticated;
grant execute on function public.todo_reschedule(bigint, date, text)               to authenticated;

-- PostgREST가 새 함수/표를 바로 인식하도록
notify pgrst, 'reload schema';
