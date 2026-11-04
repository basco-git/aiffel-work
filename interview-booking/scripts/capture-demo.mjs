// 시연 캡처(README "시연" 표의 docs/screenshots 10장)를 다시 찍는 도구
//
//   npm run capture -- login   캡처 전용 크롬 창 2개를 열어요. 관리자 A·승인 대기용 C로 직접 로그인한 뒤 창을 닫아요.
//                              닫은 뒤 로그인이 실제로 저장됐는지 확인해 알려 줘요.
//   npm run capture -- check   두 프로필의 로그인 상태만 확인해요.
//   npm run capture            시연 데이터 만들기 → 10장 캡처 → 시연 데이터 삭제·계정 C 상태 복원
//   npm run capture -- clean   남은 시연 데이터와 로그인 프로필(.capture/)을 지워요.
//
// 원칙
// - 비밀번호는 스크립트가 브라우저에 입력하지 않아요. 브라우저 로그인은 사람이 직접 해요.
//   (시연 데이터 만들기와 회원 상태 바꾸기만 .env의 시험 계정으로 Supabase에 직접 요청해요. test:rules와 같은 방식)
// - 로그인 정보가 든 크롬 프로필과 시연 링크 토큰은 .capture/에만 두고 git에 올리지 않아요(.gitignore).
// - 캡처 직전에 화면에 이메일이 남아 있으면 그 장은 저장하지 않고 멈춰요.
// - 시연 포지션 이름에는 "[시연]"을 붙이고, 끝나면 지워요. 실제 데이터는 건드리지 않아요.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".capture");
const OUT = path.join(ROOT, "docs", "screenshots");
const STATE = path.join(WORK, "demo-state.json");
const PROFILE = { A: path.join(WORK, "profile-A"), C: path.join(WORK, "profile-C"), clean: path.join(WORK, "profile-clean") };
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SITE = (process.env.CAPTURE_SITE || "https://basco-git.github.io/aiffel-work/interview-booking/").replace(/\/?$/, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (e) => (e || "").replace(/^(.).*@.*$/, "$1***@***");

function need(...keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`.env에 ${missing.join(", ")} 값이 필요해요.`);
}

async function client(account) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword(account);
  if (error) throw new Error(`시험 계정 로그인 실패: ${error.message}`);
  return db;
}
async function one(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
// 한국 시간 기준 오늘+day일 hour:minute
function kst(day, hour, minute = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, hour, minute) - 9 * 3600 * 1000).toISOString();
}

// ---------- 시연 데이터 ----------
async function makeDemo(a) {
  const state = { positions: [], links: {} };
  const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  const pos = async (title, required) => {
    const p = await one(a.from("positions").insert({ title: `[시연] ${title}`, required_interviewers: required }).select("id").single(), "포지션");
    state.positions.push(p.id); save(); // 중간에 실패해도 지울 수 있게 바로 기록
    return p;
  };
  const person = (table, positionId, name) => one(a.from(table).insert({ position_id: positionId, name }).select("id,token").single(), table);
  const slot = (positionId, startsAt, min = 30) => one(a.from("slots").insert({ position_id: positionId, starts_at: startsAt, duration_min: min }).select("id").single(), "시간");
  const avail = (token, slotId) => a.rpc("set_availability", { p_token: token, p_slot: slotId, p_available: true });
  const book = (token, slotId) => a.rpc("book_slot", { p_token: token, p_slot: slotId });

  // 진행 중 포지션: 면접관 3명·후보자 3명·시간 4개 (11:00은 면접관 1명이라 후보자에게 안 보임)
  const p1 = await pos("프론트엔드 개발자", 2);
  const [i1, i2, i3] = [await person("interviewers", p1.id, "김하늘"), await person("interviewers", p1.id, "이준호"), await person("interviewers", p1.id, "박서연")];
  const [c1, c2] = [await person("candidates", p1.id, "최민준"), await person("candidates", p1.id, "정다은")];
  await person("candidates", p1.id, "한지우");
  const s = [await slot(p1.id, kst(1, 10)), await slot(p1.id, kst(1, 10, 30)), await slot(p1.id, kst(1, 11)), await slot(p1.id, kst(1, 14), 45)];
  for (const x of [s[0], s[1], s[2]]) await avail(i1.token, x.id);
  for (const x of [s[0], s[1], s[3]]) await avail(i2.token, x.id);
  for (const x of [s[1], s[3]]) await avail(i3.token, x.id);
  await book(c1.token, s[0].id);
  state.p1 = p1.id;
  state.links.interviewer = i1.token;
  state.links.candidate = c2.token;

  await pos("백엔드 개발자", 3); // 목록이 비어 보이지 않게

  // 면접 완료 포지션: 예약 2건 뒤 완료 처리
  const p3 = await pos("데이터 분석가", 2);
  const [d1, d2] = [await person("interviewers", p3.id, "윤가람"), await person("interviewers", p3.id, "서도윤")];
  const [e1, e2] = [await person("candidates", p3.id, "강민서"), await person("candidates", p3.id, "오지훈")];
  const t = [await slot(p3.id, kst(2, 10)), await slot(p3.id, kst(2, 11))];
  for (const x of t) { await avail(d1.token, x.id); await avail(d2.token, x.id); }
  await book(e1.token, t[0].id);
  await book(e2.token, t[1].id);
  await one(a.from("positions").update({ completed_at: new Date().toISOString() }).eq("id", p3.id).select("id"), "면접 완료 처리");
  state.links.completedCandidate = e1.token;
  save();
  return state;
}

async function removeDemo(a) {
  if (!fs.existsSync(STATE)) return 0;
  const { positions = [] } = JSON.parse(fs.readFileSync(STATE, "utf8"));
  if (positions.length) await one(a.from("positions").delete().in("id", positions).select("id"), "시연 데이터 삭제");
  const { data } = await a.from("positions").select("id").in("id", positions.length ? positions : ["00000000-0000-0000-0000-000000000000"]);
  fs.rmSync(STATE, { force: true });
  return (data || []).length;
}

// ---------- 헤드리스 크롬 캡처 (CDP) ----------
const FREEZE = `(() => { const top = setTimeout(() => {}, 0); for (let i = 1; i <= top; i++) { clearInterval(i); clearTimeout(i); } })()`;
const CLEAN = `(() => {
  const re = /([A-Za-z0-9])[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walk.nextNode())) n.nodeValue = n.nodeValue.replace(re, "$1***@***");
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/.test(document.body.innerText) ? "이메일 남음" : "깨끗함";
})()`;

async function shootWith(profile, jobs) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--disable-extensions", "--no-first-run",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--window-size=1280,860", "about:blank"], { stdio: "ignore" });
  let page, browserUrl;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(200);
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
      browserUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {}
  }
  if (!page) { chrome.kill(); throw new Error("크롬을 디버그 모드로 열지 못했어요. 같은 프로필 크롬 창이 열려 있으면 닫아 주세요."); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0; const waits = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; waits.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const size = (height) => send("Emulation.setDeviceMetricsOverride", { width: 1280, height, deviceScaleFactor: 1, mobile: false });

  try {
    await send("Page.enable");
    for (const job of jobs) {
      if (job.before) await job.before();
      await size(860);
      await send("Page.navigate", { url: job.url });
      await sleep(job.wait || 4000);
      if (job.login) {
        const out = await run(`document.querySelector("#login-view") && !document.querySelector("#login-view").hidden`);
        if (out) throw new Error(`${job.file}: 캡처용 로그인이 풀려 있어요. "npm run capture -- login"으로 다시 로그인해 주세요.`);
      }
      if (job.js) { await run(`(async () => { ${job.js} })()`); await sleep(1200); }
      await run(FREEZE);
      let height = 860;
      if (job.full) { height = Math.max(860, await run("Math.ceil(document.documentElement.scrollHeight)")); await size(height); await sleep(500); }
      if ((await run(CLEAN)) !== "깨끗함") throw new Error(`${job.file}: 화면에 이메일이 남아 있어 저장하지 않았어요.`);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1280, height, scale: 1 } });
      fs.writeFileSync(path.join(OUT, job.file), Buffer.from(shot.result.data, "base64"));
      console.log(`찍음 | ${job.file} | 1280x${height}`);
    }
  } finally {
    // 로그인 토큰이 디스크에 저장되도록 빈 페이지로 옮긴 뒤 정상 종료해요(강제 종료하면 로그인이 풀릴 수 있어요).
    try { await send("Page.navigate", { url: "about:blank" }); await sleep(1500); } catch {}
    ws.close();
    const bws = new WebSocket(browserUrl);
    await new Promise((r) => (bws.onopen = r));
    bws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    await new Promise((r) => chrome.on("exit", r));
  }
}

// ---------- 명령 ----------
async function login() {
  fs.mkdirSync(WORK, { recursive: true });
  const open = (who) => new Promise((resolve) => {
    const p = spawn(CHROME, [`--user-data-dir=${PROFILE[who]}`, "--no-first-run", "--no-default-browser-check", "--new-window", `${SITE}index.html#${who}`], { stdio: "ignore" });
    p.on("exit", resolve);
  });
  console.log("캡처 전용 크롬 창 2개를 열어요.");
  console.log("  주소 끝 #A 창: 관리자 계정 A로 로그인 / 주소 끝 #C 창: 승인 대기용 계정 C로 로그인");
  console.log("  로그인한 뒤 두 창을 모두 닫으면 이 명령이 끝나요.");
  await Promise.all([open("A"), open("C")]);
  const result = { A: await loginState("A"), C: await loginState("C") };
  for (const who of ["A", "C"]) console.log(`  ${who}: ${result[who]}`);
  if (Object.values(result).some((s) => s === "로그인 안 됨")) {
    console.log('로그인이 저장되지 않은 창이 있어요. "npm run capture -- login"을 다시 실행해 로그인한 뒤 닫아 주세요.');
    process.exitCode = 1;
  } else {
    console.log("로그인 저장 완료. 이제 npm run capture 로 찍어요.");
  }
}

// 프로필에 로그인이 남아 있는지 헤드리스로 페이지를 열어 확인해요(앱·승인 대기 화면이면 로그인됨).
async function loginState(who) {
  const html = await new Promise((resolve) => {
    let out = "";
    const p = spawn(CHROME, ["--headless=new", "--disable-gpu", "--disable-extensions", `--user-data-dir=${PROFILE[who]}`,
      "--virtual-time-budget=8000", "--dump-dom", `${SITE}index.html`], { stdio: ["ignore", "pipe", "ignore"] });
    p.stdout.on("data", (d) => (out += d));
    p.on("exit", () => resolve(out));
  });
  if (!html.includes("<html")) return "확인 실패(크롬 실행 안 됨)";
  if (!/<section id="app-view" hidden/.test(html)) return "로그인됨(승인 회원)";
  if (!/id="pending-view" hidden/.test(html)) return "로그인됨(승인 대기·반려 계정)";
  return "로그인 안 됨";
}

async function check() {
  for (const who of ["A", "C"]) console.log(`${who}: ${fs.existsSync(PROFILE[who]) ? await loginState(who) : "프로필 없음"}`);
}

async function shoot() {
  need("SUPABASE_URL", "SUPABASE_ANON_KEY", "HR_A_EMAIL", "HR_A_PASSWORD", "HR_C_EMAIL", "HR_C_PASSWORD");
  for (const who of ["A", "C"]) if (!fs.existsSync(PROFILE[who])) throw new Error(`캡처용 로그인이 없어요. 먼저 "npm run capture -- login"을 실행해 주세요.`);
  fs.mkdirSync(OUT, { recursive: true });
  const a = await client({ email: process.env.HR_A_EMAIL, password: process.env.HR_A_PASSWORD });
  const c = await client({ email: process.env.HR_C_EMAIL, password: process.env.HR_C_PASSWORD });
  const cId = (await c.auth.getUser()).data.user.id;
  const cOriginal = (await one(a.from("members").select("status").eq("user_id", cId).single(), "계정 C 상태")).status;
  const setC = async (status) => {
    await one(a.from("members").update({ status }).eq("user_id", cId).select("user_id"), "계정 C 상태 바꾸기");
    console.log(`계정 C(${mask(process.env.HR_C_EMAIL)}) → ${status}`);
  };

  if (fs.existsSync(STATE)) console.log(`지난번에 남은 시연 데이터 정리: 남은 포지션 ${await removeDemo(a)}개`);
  const started = Date.now();
  try {
    const demo = await makeDemo(a);
    console.log("시연 데이터 만듦: [시연] 포지션 3개(진행 중 2, 면접 완료 1)");
    const B = `${SITE}index.html`;
    fs.rmSync(PROFILE.clean, { recursive: true, force: true });
    await shootWith(PROFILE.clean, [
      { file: "01-login.png", url: B },
      { file: "02-signup.png", url: B, js: `document.querySelector("#tab-signup").click();` },
      { file: "07-interviewer-link.png", url: `${SITE}interviewer.html?t=${demo.links.interviewer}` },
      { file: "08-candidate-link.png", url: `${SITE}candidate.html?t=${demo.links.candidate}` },
      { file: "10-candidate-completed.png", url: `${SITE}candidate.html?t=${demo.links.completedCandidate}` },
    ]);
    await setC("pending");
    await shootWith(PROFILE.C, [{ file: "03-pending.png", url: B, login: true, wait: 5000 }]);
    await shootWith(PROFILE.A, [
      { file: "04-approve.png", url: `${B}#list`, login: true, full: true, wait: 6000 },
      { file: "09-records.png", url: `${B}#records`, login: true, full: true, wait: 6000 },
      { file: "05-reapprove-delete.png", url: `${B}#list`, login: true, full: true, wait: 6000, before: () => setC("rejected") },
      // 포지션 화면은 새로고침해도 그 화면에 머무르게 되어 있어서 마지막에 찍어요.
      { file: "06-position-schedule.png", url: `${B}#position=${demo.p1}`, login: true, full: true, wait: 6000 },
    ]);
  } finally {
    await setC(cOriginal);
    console.log(`시연 데이터 삭제: 남은 시연 포지션 ${await removeDemo(a)}개`);
    fs.rmSync(PROFILE.clean, { recursive: true, force: true });
  }
  console.log(`끝 (${Math.round((Date.now() - started) / 1000)}초). docs/screenshots를 열어 확인한 뒤 커밋해 주세요.`);
}

async function clean() {
  if (fs.existsSync(STATE)) {
    need("SUPABASE_URL", "SUPABASE_ANON_KEY", "HR_A_EMAIL", "HR_A_PASSWORD");
    const a = await client({ email: process.env.HR_A_EMAIL, password: process.env.HR_A_PASSWORD });
    console.log(`시연 데이터 삭제: 남은 시연 포지션 ${await removeDemo(a)}개`);
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  console.log("캡처용 로그인 프로필(.capture/)을 지웠어요.");
}

const cmd = process.argv[2] || "shoot";
const commands = { login, check, shoot, clean };
if (!commands[cmd]) {
  console.error(`알 수 없는 명령: ${cmd} (login | check | shoot | clean)`);
  process.exit(1);
}
commands[cmd]().catch((e) => { console.error("실패:", e.message); process.exit(1); });
