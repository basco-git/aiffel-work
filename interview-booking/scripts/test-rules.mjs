/**
 * 실제 Supabase에 규칙 R1~R9를 시험하는 스크립트
 *
 * 실행:
 *   1) npm install
 *   2) .env 작성 (SUPABASE_URL, SUPABASE_ANON_KEY, HR_A_*, HR_B_*)
 *   3) npm run test:rules
 *
 * 원칙:
 * - 공개 키(anon/publishable)와 일반 사용자 로그인만 써요. service_role 키는 쓰지 않아요 (R8).
 * - 시험용 데이터만 만들고 지워요. 실제 데이터는 건드리지 않아요.
 * - 결과는 docs/evidence-live-rules.txt 에도 남겨요.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "HR_A_EMAIL",
  "HR_A_PASSWORD",
  "HR_B_EMAIL",
  "HR_B_PASSWORD",
  "HR_C_EMAIL",
  "HR_C_PASSWORD",
];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`.env에 값이 없어요: ${missing.join(", ")}`);
  console.error(".env.example을 복사해 .env를 만들고 값을 채운 뒤 다시 실행해 주세요.");
  process.exit(1);
}

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const hrA = { email: process.env.HR_A_EMAIL, password: process.env.HR_A_PASSWORD };
const hrB = { email: process.env.HR_B_EMAIL, password: process.env.HR_B_PASSWORD };
// C: 승인 대기 계정 (R6 시험용). 시험 동안 관리자 A가 상태를 맞추고, 끝나면 원래대로 되돌려요.
const hrC = { email: process.env.HR_C_EMAIL, password: process.env.HR_C_PASSWORD };

const BASE_TITLE = "시험용-규칙-";
const results = [];

function makeClient() {
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function msgOf(error) {
  if (!error) return "";
  return error.message || error.error_description || String(error);
}

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "통과" : "실패"} | ${name} | ${detail}`);
}

async function one(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${msgOf(error)}`);
  return data;
}

// 기기 시간대와 무관하게 '한국 시간' 기준 시각을 만들어요.
function kstIso(dayOffset, hour, minute = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const wall = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute);
  return new Date(wall - 9 * 3600 * 1000).toISOString();
}

function kstLabel(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function login(client, label, account) {
  const { error } = await client.auth.signInWithPassword(account);
  if (error) {
    throw new Error(`${label} 로그인 실패: ${msgOf(error)} (이메일·비밀번호와 Confirm email 설정을 확인해 주세요)`);
  }
}

async function addInterviewer(client, positionId, name) {
  return one(
    client.from("interviewers").insert({ position_id: positionId, name }).select("id,token,name").single(),
    "면접관 추가"
  );
}

async function addCandidate(client, positionId, name) {
  return one(
    client.from("candidates").insert({ position_id: positionId, name }).select("id,token,name").single(),
    "후보자 추가"
  );
}

async function addSlot(client, positionId, startsAt, durationMin = 30) {
  return one(
    client
      .from("slots")
      .insert({ position_id: positionId, starts_at: startsAt, duration_min: durationMin })
      .select("id,starts_at,duration_min")
      .single(),
    "시간 추가"
  );
}

async function removeTestPositions(client) {
  const { data } = await client.from("positions").select("id,title").like("title", `${BASE_TITLE}%`);
  for (const row of data || []) {
    await client.from("positions").delete().eq("id", row.id);
  }
}

// R8: 저장소에 비밀값이 섞이지 않았는지 확인해요.
function checkNoSecrets() {
  let ignored = false;
  try {
    execFileSync("git", ["check-ignore", "-q", ".env"], { cwd: process.cwd() });
    ignored = true;
  } catch {
    ignored = false;
  }
  check("R8 .env 미추적", ignored, ignored ? ".gitignore가 .env를 막고 있어요" : ".env가 무시되지 않아요");

  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: process.cwd(), encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    check("R8 저장소 검사", false, "git 저장소가 아니라 파일 검사를 건너뛰었어요");
    return;
  }

  const patterns = [
    /sb_secret_[A-Za-z0-9_-]{10,}/,
    /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i,
  ];
  const hits = [];
  for (const file of tracked) {
    if (!/\.(html|js|mjs|css|md|json|sql|txt|example|yml|yaml)$/.test(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (patterns.some((re) => re.test(text))) hits.push(file);
  }
  check(
    "R8 비밀 키 미포함",
    hits.length === 0,
    hits.length === 0 ? `추적 중인 파일 ${tracked.length}개에서 비밀 키 패턴 없음` : `의심 파일: ${hits.join(", ")}`
  );
}

async function main() {
  const a = makeClient();
  const b = makeClient();
  const c = makeClient();
  const anon = makeClient();
  const original = {}; // B·C의 시험 전 회원 상태 (끝나면 되돌려요)
  let ids = {};
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

  let posA = null;
  let posB = null;

  try {
    await login(a, "담당자 A", hrA);
    await login(b, "담당자 B", hrB);
    await login(c, "담당자 C(승인 대기)", hrC);

    // ---------- 회원 상태 맞추기: A=관리자, B=승인, C=대기 ----------
    ids = {
      b: (await b.auth.getUser()).data.user.id,
      c: (await c.auth.getUser()).data.user.id,
    };
    const { data: before, error: beforeError } = await a
      .from("members").select("user_id,status").in("user_id", [ids.b, ids.c]);
    if (beforeError) throw beforeError;
    for (const m of before || []) original[m.user_id] = m.status;
    await one(a.from("members").update({ status: "active" }).eq("user_id", ids.b).select("user_id"), "B 승인");
    await one(a.from("members").update({ status: "pending" }).eq("user_id", ids.c).select("user_id"), "C 대기");

    // 이전 시험에서 남은 데이터 정리 (제목이 시험용-규칙- 인 것만)
    await removeTestPositions(a);
    await removeTestPositions(b);

    // ---------- 시험 데이터 만들기 ----------
    posA = await one(
      a
        .from("positions")
        .insert({ title: `${BASE_TITLE}A-${stamp}`, required_interviewers: 2 })
        .select("id")
        .single(),
      "포지션 A 만들기"
    );

    const iv1 = await addInterviewer(a, posA.id, "면접관1");
    const iv2 = await addInterviewer(a, posA.id, "면접관2");
    await addInterviewer(a, posA.id, "면접관3");

    const cand1 = await addCandidate(a, posA.id, "후보1");
    const cand2 = await addCandidate(a, posA.id, "후보2");
    const cand3 = await addCandidate(a, posA.id, "후보3");
    const racers = [];
    for (let i = 1; i <= 10; i += 1) {
      racers.push(await addCandidate(a, posA.id, `동시후보${i}`));
    }

    const open1 = await addSlot(a, posA.id, kstIso(1, 10, 0), 30);
    const open2 = await addSlot(a, posA.id, kstIso(1, 11, 0), 30);
    const open3 = await addSlot(a, posA.id, kstIso(1, 14, 0), 45);
    const closed = await addSlot(a, posA.id, kstIso(1, 12, 0), 30);
    const past = await addSlot(a, posA.id, kstIso(-1, 10, 0), 30);

    const avail = (token, slotId, on = true) => a.rpc("set_availability", { p_token: token, p_slot: slotId, p_available: on });
    for (const slot of [open1, open2, open3, closed]) await avail(iv1.token, slot.id);
    for (const slot of [open1, open2, open3]) await avail(iv2.token, slot.id);

    const { data: open1Checks } = await a.from("availability").select("slot_id").eq("slot_id", open1.id);
    check("준비: 열린 시간에 면접관 2명", (open1Checks || []).length === 2, `가능 체크 ${(open1Checks || []).length}개`);

    // ---------- R7: 링크로는 자기 것만 ----------
    posB = await one(
      b
        .from("positions")
        .insert({ title: `${BASE_TITLE}B-${stamp}`, required_interviewers: 2 })
        .select("id")
        .single(),
      "포지션 B 만들기"
    );
    const slotB = await addSlot(b, posB.id, kstIso(1, 15, 0), 30);
    const cross = await a.rpc("set_availability", { p_token: iv1.token, p_slot: slotB.id, p_available: true });
    check(
      "R7 다른 포지션 시간 체크 거부",
      Boolean(cross.error) && msgOf(cross.error).includes("이 포지션의 시간이 아니에요"),
      msgOf(cross.error) || "거부되지 않았어요"
    );

    const wrongToken = await a.rpc("candidate_view", { p_token: "00000000-0000-4000-8000-000000000000" });
    check(
      "R7 없는 링크 거부",
      Boolean(wrongToken.error) && msgOf(wrongToken.error).includes("링크가 올바르지 않아요"),
      msgOf(wrongToken.error) || "거부되지 않았어요"
    );

    // ---------- R3: 면접관이 모자란 시간 ----------
    const r3 = await a.rpc("book_slot", { p_token: cand2.token, p_slot: closed.id });
    check(
      "R3 면접관 부족 시간 예약 거부",
      Boolean(r3.error) && msgOf(r3.error).includes("면접관 일정이 모이지 않은"),
      msgOf(r3.error) || "예약이 통과됐어요"
    );

    // ---------- R5: 지난 시간 ----------
    const r5 = await a.rpc("book_slot", { p_token: cand3.token, p_slot: past.id });
    check(
      "R5 지난 시간 예약 거부",
      Boolean(r5.error) && msgOf(r5.error).includes("이미 지난 시간"),
      msgOf(r5.error) || "예약이 통과됐어요"
    );

    // ---------- R2: 링크 하나에 예약 하나, 다시 고르면 변경 ----------
    const first = await a.rpc("book_slot", { p_token: cand1.token, p_slot: open2.id });
    check("R2 첫 예약", !first.error, msgOf(first.error) || "예약됨");
    const moved = await a.rpc("book_slot", { p_token: cand1.token, p_slot: open3.id });
    check("R2 다른 시간으로 변경", !moved.error, msgOf(moved.error) || "변경됨");
    const { data: mine } = await a.from("bookings").select("slot_id").eq("candidate_id", cand1.id);
    const { data: oldBooking } = await a.from("bookings").select("slot_id").eq("slot_id", open2.id);
    check(
      "R2 링크당 예약 1개",
      (mine || []).length === 1 && mine[0].slot_id === open3.id && (oldBooking || []).length === 0,
      `내 예약 ${(mine || []).length}개, 이전 시간 예약 ${(oldBooking || []).length}개`
    );

    // ---------- R4: 예약된 시간은 면접관이 해제 불가 ----------
    const r4 = await avail(iv1.token, open3.id, false);
    check(
      "R4 예약된 시간 체크 해제 거부",
      Boolean(r4.error) && msgOf(r4.error).includes("이미 예약된 시간"),
      msgOf(r4.error) || "해제가 통과됐어요"
    );

    // ---------- R1: 같은 시간 동시 예약 10건 ----------
    const attempts = await Promise.all(
      racers.map((c) => a.rpc("book_slot", { p_token: c.token, p_slot: open1.id }))
    );
    const won = attempts.filter((r) => !r.error);
    const rejected = attempts.filter((r) => r.error).map((r) => msgOf(r.error));
    check(
      "R1 동시 예약 10건 중 1건만",
      won.length === 1,
      `${attempts.length}건 중 ${won.length}건 성공 · 거부 예: ${rejected[0] || "-"}`
    );
    const { data: open1Bookings } = await a.from("bookings").select("slot_id").eq("slot_id", open1.id);
    check("R1 DB에도 1건", (open1Bookings || []).length === 1, `예약 행 ${(open1Bookings || []).length}개`);

    // ---------- R6: 승인된 담당자만 함께 보고 관리, 가입만으로는 접근 불가 ----------
    const statusOf = async (userId) =>
      (await a.from("members").select("status").eq("user_id", userId).single()).data?.status;

    const { data: bPositions, error: bPosError } = await b.from("positions").select("id");
    check(
      "R6 승인 회원끼리 일정 공유",
      !bPosError && (bPositions || []).some((p) => p.id === posA.id),
      bPosError ? msgOf(bPosError) : "승인된 B에게 A가 만든 포지션이 보여요"
    );

    const { data: cPositions, error: cPosError } = await c.from("positions").select("id");
    const cInsert = await c.from("positions").insert({ title: `${BASE_TITLE}대기계정-${stamp}` }).select("id");
    check(
      "R6 승인 대기 계정 조회·생성 차단",
      (Boolean(cPosError) || (cPositions || []).length === 0) && Boolean(cInsert.error),
      `조회 ${cPosError ? msgOf(cPosError) : `행 ${(cPositions || []).length}개`} · 생성 ${cInsert.error ? msgOf(cInsert.error) : "됨(문제)"}`
    );

    const cDelete = await c.from("bookings").delete().eq("slot_id", open3.id);
    const { data: stillBooked } = await a.from("bookings").select("slot_id").eq("slot_id", open3.id);
    check(
      "R6 승인 대기 계정 예약 취소 차단",
      (stillBooked || []).length === 1,
      cDelete.error ? msgOf(cDelete.error) : `C의 삭제 요청 뒤에도 예약 ${(stillBooked || []).length}건`
    );

    await c.from("members").update({ status: "active", role: "admin" }).eq("user_id", ids.c);
    check("R6 대기 계정이 스스로 승인 불가", (await statusOf(ids.c)) === "pending", `요청 뒤 C 상태: ${await statusOf(ids.c)}`);

    await b.from("members").update({ status: "active" }).eq("user_id", ids.c);
    const { data: bMembers } = await b.from("members").select("user_id");
    check(
      "R6 일반 회원은 다른 회원 승인·조회 불가",
      (await statusOf(ids.c)) === "pending" && (bMembers || []).every((m) => m.user_id === ids.b),
      `B의 승인 요청 뒤 C 상태: ${await statusOf(ids.c)} · B가 본 회원 ${(bMembers || []).length}명(자기 자신만)`
    );

    const { data: anonPositions, error: anonError } = await anon.from("positions").select("id");
    check(
      "R6 비로그인 현황 차단",
      Boolean(anonError) || (anonPositions || []).length === 0,
      anonError ? msgOf(anonError) : "행 0개"
    );

    await one(a.from("members").update({ status: "rejected" }).eq("user_id", ids.b).select("user_id"), "B 승인 취소");
    const { data: revoked, error: revokedError } = await b.from("positions").select("id");
    check(
      "R6 승인 취소 뒤 접근 차단",
      Boolean(revokedError) || (revoked || []).length === 0,
      revokedError ? msgOf(revokedError) : `승인 취소된 B가 본 포지션 ${(revoked || []).length}개`
    );

    // R6 계정 삭제(퇴사자): 관리자만, 승인 취소된 일반 회원만. 실제로 지우지는 않고 거부되는 경우만 시험해요.
    const bDeletesC = await b.rpc("delete_member", { target: ids.c });
    const aDeletesPending = await a.rpc("delete_member", { target: ids.c });
    const aId = (await a.auth.getUser()).data.user.id;
    const aDeletesSelf = await a.rpc("delete_member", { target: aId });
    const cAfter = await statusOf(ids.c);
    check(
      "R6 계정 삭제는 관리자·승인 취소 계정만",
      Boolean(bDeletesC.error) && Boolean(aDeletesPending.error) && Boolean(aDeletesSelf.error) && cAfter === "pending",
      `일반 회원 B의 삭제 요청: ${bDeletesC.error ? msgOf(bDeletesC.error) : "됨(문제)"} · ` +
        `대기 계정 C 삭제: ${aDeletesPending.error ? msgOf(aDeletesPending.error) : "됨(문제)"} · ` +
        `관리자 자기 삭제: ${aDeletesSelf.error ? msgOf(aDeletesSelf.error) : "됨(문제)"} · C 상태 ${cAfter || "없음"}`
    );
    await one(a.from("members").update({ status: "active" }).eq("user_id", ids.b).select("user_id"), "B 다시 승인");

    // ---------- R9: 시간 겹침·15분 단위 ----------
    const overlap = await a
      .from("slots")
      .insert({ position_id: posA.id, starts_at: kstIso(1, 10, 15), duration_min: 30 });
    check(
      "R9 겹치는 시간 거부",
      Boolean(overlap.error),
      overlap.error ? `${overlap.error.code || ""} ${msgOf(overlap.error)}`.trim() : "겹치는 시간이 저장됐어요"
    );

    const badDuration = await a
      .from("slots")
      .insert({ position_id: posA.id, starts_at: kstIso(1, 16, 0), duration_min: 20 });
    check(
      "R9 15분 단위 아님 거부",
      Boolean(badDuration.error),
      badDuration.error ? `${badDuration.error.code || ""} ${msgOf(badDuration.error)}`.trim() : "20분 시간이 저장됐어요"
    );

    // ---------- R10: 채용 완료된 포지션은 새 예약·가능 체크 거부 ----------
    await one(a.from("positions").update({ completed_at: new Date().toISOString() }).eq("id", posA.id).select("id"), "포지션 채용 완료");
    const doneBook = await a.rpc("book_slot", { p_token: cand2.token, p_slot: open2.id });
    const doneAvail = await avail(iv2.token, closed.id);
    const doneView = await a.rpc("candidate_view", { p_token: cand2.token });
    check(
      "R10 채용 완료 포지션 예약·체크 거부",
      Boolean(doneBook.error) && Boolean(doneAvail.error) && doneView.data?.completed === true,
      `예약 ${doneBook.error ? msgOf(doneBook.error) : "됨(문제)"} · 체크 ${doneAvail.error ? msgOf(doneAvail.error) : "됨(문제)"} · 후보자 화면 completed=${doneView.data?.completed}`
    );
    await one(a.from("positions").update({ completed_at: null }).eq("id", posA.id).select("id"), "포지션 다시 진행");
    const reopenBook = await a.rpc("book_slot", { p_token: cand2.token, p_slot: open2.id });
    check(
      "R10 다시 진행하면 예약 가능",
      !reopenBook.error,
      reopenBook.error ? msgOf(reopenBook.error) : "다시 진행 뒤 후보2 예약됨"
    );

    // ---------- R7: 링크 화면이 보여 주는 범위 ----------
    const ivView = await a.rpc("interviewer_view", { p_token: iv1.token });
    const ivJson = JSON.stringify(ivView.data || {});
    check(
      "R7 면접관 화면에 다른 이름 없음",
      !ivView.error && !ivJson.includes("면접관2") && !ivJson.includes("면접관3"),
      ivView.error ? msgOf(ivView.error) : `내 이름 ${ivView.data?.name} · 시간 ${ivView.data?.slots?.length}개`
    );

    const candView = await a.rpc("candidate_view", { p_token: cand1.token });
    const candJson = JSON.stringify(candView.data || {});
    const statuses = (candView.data?.slots || []).map((s) => s.status);
    check(
      "R7 후보자 화면에 면접관 이름·닫힌 시간 없음",
      !candView.error && !candJson.includes("면접관") && !statuses.includes("closed"),
      candView.error ? msgOf(candView.error) : `보이는 상태: ${statuses.join(", ") || "없음"}`
    );

    // ---------- R8: 저장소 비밀값 ----------
    checkNoSecrets();
  } catch (error) {
    check("시험 진행", false, msgOf(error));
  } finally {
    // ---------- 시험 데이터 정리 ----------
    try {
      if (posA) await a.from("positions").delete().eq("id", posA.id);
      if (posB) await b.from("positions").delete().eq("id", posB.id);
      await removeTestPositions(a);
      await removeTestPositions(b);
      // B·C 회원 상태를 시험 전으로 되돌려요
      for (const [userId, status] of Object.entries(original)) {
        await a.from("members").update({ status }).eq("user_id", userId);
      }
      const { data: leftovers } = await a.from("positions").select("id").like("title", `${BASE_TITLE}%`);
      check("정리: 시험 데이터 삭제", (leftovers || []).length === 0, `남은 시험 포지션 ${(leftovers || []).length}개`);
    } catch (cleanupError) {
      check("정리: 시험 데이터 삭제", false, msgOf(cleanupError));
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const lines = [
    "# 실제 Supabase 규칙 시험 결과",
    "",
    `- 일시: ${kstLabel()}`,
    `- 프로젝트: ${new URL(URL_).host}`,
    `- 결과: ${passed}/${results.length} 통과${failed ? ` · ${failed}개 실패` : ""}`,
    "",
    "| 시험 | 결과 | 실제로 본 것 |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.ok ? "통과" : "실패"} | ${String(r.detail).replace(/\|/g, "\\|")} |`),
    "",
    "> 집계는 공개 키와 담당자 A(관리자)·B(승인)·C(승인 대기) 로그인으로만 했어요. B·C 상태는 시험 뒤 원래대로 되돌렸어요. service_role 키는 쓰지 않았어요.",
    "",
  ];
  writeFileSync("docs/evidence-live-rules.txt", lines.join("\n"), "utf8");

  console.log("");
  console.log(`결과: ${passed}/${results.length} 통과${failed ? `, ${failed}개 실패` : ""}`);
  console.log("기록: docs/evidence-live-rules.txt");
  process.exit(failed ? 1 : 0);
}

await main();
