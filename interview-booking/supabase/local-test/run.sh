#!/usr/bin/env bash
# 로컬 PostgreSQL에서 schema.sql의 규칙 R1~R9를 실제 요청으로 시험해요.
# ⚠️ 공유·승인(members) 방식으로 바꾸기 전 스키마(커밋 3178acc) 기준이에요. 지금 스키마의 검증은
#    실제 Supabase에 보내는 `npm run test:rules`(scripts/test-rules.mjs)를 기준으로 해요.
# 사용: PSQL=psql경로 PGPORT=포트 bash run.sh   (빈 시험용 DB에서만 실행하세요)
set -u
cd "$(dirname "$0")"
PSQL="${PSQL:-psql}"; export PGCLIENTENCODING=UTF8 PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
q(){ "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 "$@" | tr -d '\r'; }
A=00000000-0000-0000-0000-00000000000a; B=00000000-0000-0000-0000-00000000000b
q -f ../schema.sql >/dev/null 2>&1 || { echo "✗ schema.sql 실행 실패"; exit 1; }

# 시험 도우미: 오류가 나야 하는 요청이 실제로 거부되는지
q <<'SQL' >/dev/null
create schema if not exists t; grant usage on schema t to anon, authenticated;
-- want: 기대하는 거부 메시지 일부. 다른 이유로 실패하면 통과가 아니에요.
create or replace function t.expect_error(label text, stmt text, want text) returns text language plpgsql as $$
begin execute stmt; return '✗ ' || label || ' → 거부되지 않음';
exception when others then
  return case when position(want in sqlerrm) > 0 then '✓ ' else '✗ ' end || label || ' → 거부: ' || sqlerrm; end $$;
create or replace function t.ok(label text, cond boolean) returns text language sql as $$
  select case when cond then '✓ ' else '✗ ' end || label $$;
grant execute on all functions in schema t to anon, authenticated;
SQL

# Windows에서는 명령줄 인자의 한글이 깨지므로 SQL은 표준 입력으로 넘겨요
as(){ local who=$1; shift; printf "set role authenticated;
select set_config('request.jwt.claim.sub','%s',false);
%s;
" "$who" "$*" | q | tail -n +2; }
anon(){ printf "set role anon;
%s;
" "$*" | q; }

# 담당자 A: 포지션(면접관 2명 필요), 면접관 3명, 후보자 10명, 시간 4개(하나는 지난 시간)
P=$(as $A "insert into positions(title,required_interviewers) values('백엔드 개발자',2) returning id")
for n in 김면접 이면접 박면접; do as $A "insert into interviewers(position_id,name) values('$P','$n')" >/dev/null; done
for i in $(seq 1 10); do as $A "insert into candidates(position_id,name) values('$P','후보$i')" >/dev/null; done
day=$(date -d tomorrow +%F)
S1=$(as $A "insert into slots(position_id,starts_at,duration_min) values('$P','$day 10:00+09',30) returning id")
S2=$(as $A "insert into slots(position_id,starts_at,duration_min) values('$P','$day 10:30+09',30) returning id")
S3=$(as $A "insert into slots(position_id,starts_at,duration_min) values('$P','$day 11:00+09',45) returning id")
SP=$(as $A "insert into slots(position_id,starts_at,duration_min) values('$P',now()-interval '1 day',30) returning id")
IV=($(as $A "select token from interviewers where position_id='$P' order by name desc"))   # 이·박·김 순은 상관없음
CT=($(as $A "select token from candidates where position_id='$P' order by created_at"))
echo "준비: 포지션 1, 면접관 ${#IV[@]}, 후보자 ${#CT[@]}, 시간 4"

echo "--- R9 시간 겹침·15분 단위"
as $A "select t.expect_error('10:15~10:45 겹치는 시간 추가', \$\$insert into slots(position_id,starts_at,duration_min) values('$P','$day 10:15+09',30)\$\$, 'slots_no_overlap')"
as $A "select t.expect_error('길이 20분', \$\$insert into slots(position_id,starts_at,duration_min) values('$P','$day 13:00+09',20)\$\$, 'duration_min')"
as $A "select t.ok('끝 시각 자동 계산(11:00+45분=11:45)', (select ends_at = starts_at + interval '45 min' from slots where id='$S3'))"

# 면접관 체크: S1·S3·지난 시간은 2명, S2는 1명만
for s in $S1 $S3 $SP; do anon "select set_availability('${IV[0]}','$s',true); select set_availability('${IV[1]}','$s',true);" >/dev/null; done
anon "select set_availability('${IV[0]}','$S2',true)" >/dev/null

echo "--- R3 면접관 부족 · R5 지난 시간"
anon "select t.expect_error('면접관 1명만 가능한 시간 예약', \$\$select book_slot('${CT[0]}','$S2')\$\$, '면접관 일정')"
anon "select t.expect_error('지난 시간 예약', \$\$select book_slot('${CT[0]}','$SP')\$\$, '지난 시간')"
anon "select t.ok('후보자 화면에 면접관 부족 시간(S2)은 안 보임', position('$S2' in candidate_view('${CT[0]}')::text) = 0)"

echo "--- R1 동시 예약: 후보자 10명이 같은 시간(S1)을 동시에"
tmp=$(mktemp -d)
for i in $(seq 0 9); do anon "select book_slot('${CT[$i]}','$S1')" >/dev/null 2>"$tmp/e$i" & done; wait
okc=0; for f in "$tmp"/e*; do [ -s "$f" ] || okc=$((okc+1)); done; echo "  성공 $okc건 / 실패 $((10-okc))건 (거부 메시지 예: $(grep -ho '방금[^.]*' "$tmp"/e* | head -1))"
as $A "select t.ok('S1 예약은 정확히 1건', (select count(*)=1 from bookings where slot_id='$S1'))"
W=$(as $A "select c.token from bookings b join candidates c on c.id=b.candidate_id where b.slot_id='$S1'")

echo "--- R2 링크 하나에 예약 하나(다시 고르면 변경)"
anon "select book_slot('$W','$S3')" >/dev/null
as $A "select t.ok('변경 뒤에도 그 후보자의 예약은 1건이고 S3로 옮겨짐', (select count(*)=1 and bool_and(slot_id='$S3') from bookings b join candidates c on c.id=b.candidate_id where c.token='$W'))"
as $A "select t.ok('S1은 다시 비었음', not exists(select 1 from bookings where slot_id='$S1'))"

echo "--- R4 예약된 시간의 체크 해제"
anon "select t.expect_error('예약된 S3에서 면접관 체크 해제', \$\$select set_availability('${IV[0]}','$S3',false)\$\$, '해제할 수 없어요')"

echo "--- R6 다른 담당자·비로그인"
PB=$(as $B "insert into positions(title) values('B의 포지션') returning id")
SB=$(as $B "insert into slots(position_id,starts_at) values('$PB','$day 15:00+09') returning id")
as $B "select t.ok('담당자 B에게 A의 포지션·예약이 안 보임', (select count(*) from positions where id='$P')=0 and (select count(*) from bookings)=0)"
as $B "delete from slots where id='$S1'" >/dev/null
as $A "select t.ok('담당자 B가 A의 시간을 지우려 해도 그대로 남음', exists(select 1 from slots where id='$S1'))"
anon "select t.expect_error('비로그인으로 예약 명단 직접 조회', \$\$select * from bookings\$\$, 'permission denied')"
anon "select t.expect_error('비로그인으로 예약 직접 추가', \$\$insert into bookings(slot_id,candidate_id) values('$S1',gen_random_uuid())\$\$, 'permission denied')"
as $A "select t.expect_error('담당자도 예약은 함수 없이 직접 추가 불가', \$\$insert into bookings(slot_id,candidate_id) values('$S2',gen_random_uuid())\$\$, 'permission denied')"

echo "--- R7 링크로는 자기 것만"
anon "select t.expect_error('A 포지션 면접관 링크로 B 포지션 시간 체크', \$\$select set_availability('${IV[0]}','$SB',true)\$\$, '이 포지션의 시간이 아니에요')"
anon "select t.expect_error('없는 링크로 예약', \$\$select book_slot(gen_random_uuid(),'$S1')\$\$, '링크가 올바르지')"
anon "select t.ok('후보자 화면에 면접관·다른 후보자 이름 없음(자기 이름만)', (select v ~ '후보2' and v !~ '[김이박]면접' and v !~ '후보(1|[3-9])' from (select candidate_view('${CT[1]}')::text v) x))"
anon "select t.ok('면접관 화면에 다른 면접관·후보자 이름 없음(자기 이름만)', (select v !~ '후보' and (select count(*) from regexp_matches(v,'[김이박]면접','g'))=1 from (select interviewer_view('${IV[0]}')::text v) x))"
rm -rf "$tmp"
