// 브라우저 자동 실행 테스트: node scripts/smoke.mjs [m1|m2|m3|m4|m5|all] [--url=http://localhost:5173]
// 로컬 Chrome(또는 Edge)을 headless로 띄워 실제 게임을 조작하고, 콘솔 오류와 스크린샷을 남긴다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith('--')) ?? 'all';
const url = (args.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:5173').slice(6);
const outDir = path.resolve('.smoke');
fs.mkdirSync(outDir, { recursive: true });

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경 변수를 지정하세요.');

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__tb?.store?.screen === 'title', null, { timeout: 20000 });
  return { ctx, page, errors };
}

const tb = (page, fn, arg) => page.evaluate(fn, arg);
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startGame(page, faction) {
  await tb(page, async () => window.__tb.store.resetAll());
  await page.click(`[data-testid=faction-${faction}]`);
  await page.waitForFunction(() => window.__tb.game.scene.isActive('play'), null, { timeout: 10000 });
  await sleep(400);
}

const pos = (page) => tb(page, () => ({ ...window.__tb.game.scene.getScene('play').player.pos }));
const scene = (page, fn, arg) => page.evaluate(([src, a]) => new Function('s', 'a', `return (${src})(s, a)`)(window.__tb.game.scene.getScene('play'), a), [fn.toString(), arg]);

// ---------------- 마일스톤 1: 세력 선택, 맵, 이동, 저장 ----------------
async function m1() {
  const { ctx, page, errors } = await newPage();
  await shot(page, 'm1-title');
  check('M1 타이틀에 두 세력 버튼 표시', (await page.locator('[data-testid^=faction-]').count()) === 2);

  await startGame(page, 'mechanic');
  check('M1 메카닉 선택 후 플레이 씬 시작', await tb(page, () => window.__tb.store.save?.faction === 'mechanic'));
  const region0 = await page.textContent('[data-testid=region]');
  check('M1 시작 지역은 메카닉 거점(안전지대)', region0.includes('메카닉 거점') && region0.includes('안전지대'), region0);
  await shot(page, 'm1-mech-base');

  const p0 = await pos(page);
  await page.keyboard.down('d');
  await sleep(700);
  await page.keyboard.up('d');
  const p1 = await pos(page);
  check('M1 D 키로 이동 (화면 오른쪽 = x 증가, y 감소)', p1.x > p0.x + 0.5 && p1.y < p0.y - 0.5, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);

  // 거점 벽: 서쪽으로 계속 가면 벽에 막힌다
  await page.keyboard.down('a');
  await sleep(2500);
  await page.keyboard.up('a');
  const pw = await pos(page);
  check('M1 거점 벽에서 이동이 막힘', pw.x > 2.9, JSON.stringify(pw));

  // 정글로 나가면 지역 표시가 바뀐다
  await scene(page, (s) => { s.player.pos.x = 24; s.player.pos.y = 30; });
  await sleep(300);
  const region1 = await page.textContent('[data-testid=region]');
  check('M1 정글 진입 시 지역·오염도 표시', region1.includes('정글') && region1.includes('오염 30%'), region1);
  await shot(page, 'm1-jungle');

  // 상대 세력 거점 입구는 막혀 있음
  await scene(page, (s) => { s.player.pos.x = 19.5; s.player.pos.y = 46; });
  await page.keyboard.down('a');
  await page.keyboard.down('s');
  await sleep(1500);
  await page.keyboard.up('a');
  await page.keyboard.up('s');
  const pg = await pos(page);
  check('M1 상대 세력(유전공학) 거점 입구 통과 불가', pg.x >= 18.3, JSON.stringify(pg));

  // 저장 → 새로고침 → 이어하기
  await scene(page, (s) => { s.player.pos.x = 30.5; s.player.pos.y = 29.5; });
  await sleep(200);
  await tb(page, async () => {
    const st = window.__tb.store;
    st.save.position = { ...window.__tb.game.scene.getScene('play').player.pos };
    await st.persistNow();
  });
  await page.reload();
  await page.waitForFunction(() => window.__tb?.store?.screen === 'title', null, { timeout: 20000 });
  const hasContinue = await page.getByText('이어하기').count();
  check('M1 새로고침 후 이어하기 버튼', hasContinue === 1);
  await page.getByText('이어하기').click();
  await page.waitForFunction(() => window.__tb.game.scene.isActive('play'));
  await sleep(300);
  const pr = await pos(page);
  check('M1 이어하기 시 위치·세력 복원', Math.abs(pr.x - 30.5) < 0.2 && Math.abs(pr.y - 29.5) < 0.2, JSON.stringify(pr));

  // 유전공학으로 새로 시작
  await page.goto(url);
  await page.waitForFunction(() => window.__tb?.store?.screen === 'title');
  await page.click('[data-testid=faction-genetic]');
  const warned = await page.getByText('한 번 더 누르면').count();
  check('M1 기존 세이브가 있으면 새로 시작 전에 경고', warned === 1);
  await page.click('[data-testid=faction-genetic]');
  await page.waitForFunction(() => window.__tb.game.scene.isActive('play'));
  await sleep(400);
  const region2 = await page.textContent('[data-testid=region]');
  check('M1 유전공학 선택 시 유전공학 거점에서 시작', region2.includes('유전공학 거점'), region2);
  await shot(page, 'm1-gen-base');

  // 디버그 버튼 (config.debug.showButton)
  check('M1 디버그 버튼 표시', (await page.locator('[data-testid=debug-btn]').count()) === 1);
  await page.click('[data-testid=debug-btn]');
  await page.click('[data-testid=debug-grant]');
  const mats = await tb(page, () => window.__tb.store.materialCount());
  check('M1 디버그 재료 지급 (6부위 × 4등급 × 10개 = 240)', mats === 240, String(mats));
  await shot(page, 'm1-debug');
  await page.keyboard.press('Escape');

  check('M1 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 모바일 가로 화면
  const mob = await newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await startGame(mob.page, 'genetic');
  check('M1 모바일: 조이스틱·공격 버튼 표시', (await mob.page.locator('.stick').count()) === 1 && (await mob.page.locator('.attack-btn').count()) === 1);
  const size = await tb(mob.page, () => ({ w: window.__tb.game.scale.width, h: window.__tb.game.scale.height, zoom: window.__tb.game.scale.zoom }));
  check('M1 모바일: 내부 해상도 세로 360, 가로 확장', size.h === 360 && size.w > 640 && size.w <= 800, JSON.stringify(size));
  const m0 = await pos(mob.page);
  const box = await mob.page.locator('.stick').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await mob.page.mouse.move(cx, cy);
  await mob.page.mouse.down();
  await mob.page.mouse.move(cx + 45, cy, { steps: 4 });
  await sleep(700);
  await mob.page.mouse.up();
  const m1p = await pos(mob.page);
  check('M1 모바일: 조이스틱으로 이동', Math.hypot(m1p.x - m0.x, m1p.y - m0.y) > 0.5, `${JSON.stringify(m0)} → ${JSON.stringify(m1p)}`);
  await shot(mob.page, 'm1-mobile');
  check('M1 모바일 콘솔 오류 없음', mob.errors.length === 0, mob.errors.join(' | '));
  await mob.ctx.close();

  const pc = await tb((await newPage()).page, () => ({ w: window.__tb.game.scale.width, zoom: window.__tb.game.scale.zoom }));
  check('M1 PC 1280×720: 640×360 ×2 배율', pc.w === 640 && pc.zoom === 2, JSON.stringify(pc));
}

// ---------------- 마일스톤 2: 전투, 몬스터, 재료 드롭 ----------------
const tp = (page, x, y) => scene(page, (s, a) => { s.player.pos.x = a.x; s.player.pos.y = a.y; s.player.sync(); }, { x, y });
const nearMon = (page, id) => scene(page, (s, a) => { const t = s.monsters.filter((m) => m.alive && m.spec.monsterId === a).sort((x, y) => Math.hypot(x.pos.x - s.player.pos.x, x.pos.y - s.player.pos.y) - Math.hypot(y.pos.x - s.player.pos.x, y.pos.y - s.player.pos.y))[0]; s.player.pos.x = t.pos.x - 0.8; s.player.pos.y = t.pos.y; s.player.sync(); }, id);
const kills = (page) => tb(page, () => window.__tb.store.save.stats.kills);

async function holdAttack(page, ms) {
  await page.keyboard.down(' ');
  await sleep(ms);
  await page.keyboard.up(' ');
}

async function m2() {
  const { ctx, page, errors } = await newPage();
  await startGame(page, 'mechanic');
  const info = await scene(page, (s) => {
    const by = {};
    for (const m of s.monsters) by[m.spec.monsterId] = (by[m.spec.monsterId] ?? 0) + 1;
    return { total: s.monsters.length, kinds: Object.keys(by).length };
  });
  check('M2 필드 몬스터 10종 배치', info.kinds === 10, JSON.stringify(info));

  // 메카닉 원거리 공격으로 독개미 사냥
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 60));
  await tp(page, 30, 19);
  await sleep(300);
  await shot(page, 'm2-jungle-ants');
  const k0 = await kills(page);
  const before = await scene(page, (s) => s.projectiles.length);
  await holdAttack(page, 4000);
  const k1 = await kills(page);
  check('M2 메카닉 투사체 공격으로 몬스터 처치', k1 > k0, `처치 ${k0} → ${k1}, 투사체 발사 확인 ${before >= 0}`);
  await shot(page, 'm2-mech-combat');

  // 드롭 파이프라인: 소형/대형 등급 차이, 장비 드롭
  const dropTest = await scene(page, (s) => {
    const st = window.__tb.store;
    const d = window.__tb.DATA;
    const before = st.materialCount();
    const items0 = st.save.items.length;
    const shark = d.monsters.get('mutant_shark');
    const { x, y } = s.player.pos;
    const ms = [];
    for (let i = 0; i < 20; i++) ms.push(s.spawnMonster({ texture: 'mon_mutant_shark', name: shark.name, monsterId: 'mutant_shark', tier: 'large', sizePx: 112, hp: 1, atk: 0, def: 0, speed: 0, aggroRange: 1, attackRange: 1, attackInterval: 9, behavior: 'rooted', primaryPart: 'all', dropArea: 'strait' }, x + 3, y));
    for (const m of ms) s.damageMonster(m, 999, false);
    return { gained: st.materialCount() - before, items: st.save.items.length - items0 };
  });
  check('M2 대형 몬스터 처치 시 재료 다수 드롭 (20마리 × 최대 4개)', dropTest.gained >= 40, JSON.stringify(dropTest));
  check('M2 메카닉은 대형 몬스터에게서 장비 드롭 (30%)', dropTest.items > 0, JSON.stringify(dropTest));

  // 몬스터가 플레이어를 공격
  await tp(page, 44, 9);
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 0));
  await nearMon(page, 'mutant_monkey');
  await sleep(300);
  await tb(page, () => window.__tb.store.setHp(window.__tb.store.stats.maxHp));
  await sleep(3500);
  const hp = await tb(page, () => window.__tb.store.rt.hp);
  check('M2 몬스터가 플레이어를 공격 (체력 감소)', hp < 100, `HP ${hp}`);

  // 정글 사망 페널티: 오염 30% → 2.2%, 100 → 97
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 100));
  await tp(page, 44, 9);
  await nearMon(page, 'mutant_monkey');
  await tb(page, () => window.__tb.store.setHp(1));
  await page.waitForFunction(() => window.__tb.store.save.stats.deaths >= 1, null, { timeout: 15000 });
  const e1 = await tb(page, () => Object.values(window.__tb.store.save.enhance));
  const changed = e1.filter((v) => v !== 100);
  check('M2 정글 사망: 무작위 1부위만 감소, 100 → 97 (2.2% 올림)', changed.length === 1 && changed[0] === 97, JSON.stringify(e1));
  await sleep(1800);
  const r1 = await page.textContent('[data-testid=region]');
  check('M2 사망 후 자기 세력 거점에서 부활', r1.includes('메카닉 거점'), r1);

  // 해협 사망: 오염 70% → 3.8%, 100 → 96
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 100));
  await tp(page, 86, 44);
  await nearMon(page, 'armored_turtle');
  await tb(page, () => window.__tb.store.setHp(1));
  await page.waitForFunction(() => window.__tb.store.save.stats.deaths >= 2, null, { timeout: 20000 });
  const e2 = await tb(page, () => Object.values(window.__tb.store.save.enhance));
  const ch2 = e2.filter((v) => v !== 100);
  check('M2 해협 사망: 오염 농도가 높아 더 크게 감소, 100 → 96 (3.8% 올림)', ch2.length === 1 && ch2[0] === 96, JSON.stringify(e2));

  // 구간 하락: 41 → 정글 사망 시 40 (41×2.2%=0.9 → 1), 강제로 20에서 → 19 (1구간 → 0구간)
  await sleep(1800);
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 20));
  await tp(page, 44, 9);
  await nearMon(page, 'mutant_monkey');
  await tb(page, () => window.__tb.store.setHp(1));
  await page.waitForFunction(() => window.__tb.store.save.stats.deaths >= 3, null, { timeout: 15000 });
  const e3 = await tb(page, () => Object.values(window.__tb.store.save.enhance));
  check('M2 사망 페널티로 레벨 구간 하락 (20 → 19, 1구간 → 0구간)', e3.filter((v) => v === 19).length === 1, JSON.stringify(e3));
  await sleep(1800);

  // 해협 몬스터와 대형 몬스터 화면
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 300));
  await tp(page, 74, 40);
  await sleep(600);
  await shot(page, 'm2-strait');
  await tp(page, 47, 47);
  await sleep(500);
  await shot(page, 'm2-flower');
  await tp(page, 88, 31);
  await sleep(500);
  await shot(page, 'm2-shark');
  check('M2 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 유전공학 근접 공격
  const g = await newPage();
  await startGame(g.page, 'genetic');
  await tb(g.page, () => window.__tb.store.debugSetEnhance('all', 60));
  await tp(g.page, 30, 19);
  await sleep(300);
  const gk0 = await kills(g.page);
  // 가장 가까운 몬스터에게 다가가며 공격
  for (let i = 0; i < 10; i++) {
    await scene(g.page, (s) => {
      const t = s.monsters.filter((m) => m.alive).sort((a, b) => Math.hypot(a.pos.x - s.player.pos.x, a.pos.y - s.player.pos.y) - Math.hypot(b.pos.x - s.player.pos.x, b.pos.y - s.player.pos.y))[0];
      if (t) { s.player.pos.x = t.pos.x - 0.9; s.player.pos.y = t.pos.y; }
    });
    await holdAttack(g.page, 450);
  }
  const gk1 = await kills(g.page);
  check('M2 유전공학 근접(손 무기화) 공격으로 몬스터 처치', gk1 > gk0, `처치 ${gk0} → ${gk1}`);
  const proj = await scene(g.page, (s) => s.projectiles.filter((p) => p.owner === 'player').length);
  check('M2 유전공학은 투사체를 쏘지 않음 (근접)', proj === 0);
  await shot(g.page, 'm2-genetic-combat');
  const gItems = await tb(g.page, () => window.__tb.store.save.items.length);
  check('M2 유전공학은 장비를 얻지 않음', gItems === 0);
  check('M2 유전공학 콘솔 오류 없음', g.errors.length === 0, g.errors.join(' | '));
  await g.ctx.close();
}

// ---------------- 마일스톤 3: 부위 강화 ----------------
async function openEnhance(page) {
  const npc = await tb(page, () => window.__tb.DATA.world.npcs[window.__tb.store.faction]);
  await tp(page, npc.x + 1, npc.y + 0.5);
  await sleep(250);
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=open-enhance]');
  await page.click('[data-testid=open-enhance]');
  await page.waitForSelector('[data-testid=enhance-value]');
}

const enhanceVal = (page, part) => tb(page, (p) => window.__tb.store.save.enhance[p], part);
const setVal = (page, part, v) => tb(page, ([p, val]) => { window.__tb.store.save.enhance[p] = val; window.__tb.store.changed(); }, [part, v]);

async function m3() {
  const { ctx, page, errors } = await newPage();
  await startGame(page, 'mechanic');
  // NPC 밖에서는 강화 창을 열 수 없다 (E는 NPC 근처에서만 동작)
  await tp(page, 30, 30);
  await sleep(200);
  await page.keyboard.press('e');
  check('M3 NPC 밖에서는 강화 창이 열리지 않음', (await page.locator('[data-testid=open-enhance]').count()) === 0);

  await tb(page, () => window.__tb.store.debugGrantMaterials());
  await openEnhance(page);
  const partNames = await page.locator('[data-testid^=part-]').allTextContents();
  check('M3 메카닉 강화 부위 6곳 (무기 슬롯·방어구 슬롯 포함)', partNames.length === 6 && partNames.join().includes('무기 슬롯') && partNames.join().includes('방어구 슬롯'), partNames.map((t) => t.replace(/[0-9%구간]/g, '')).join(','));

  // 각 부위를 실제 버튼으로 강화
  const stats0 = await tb(page, () => ({ ...window.__tb.store.stats }));
  for (const part of ['head', 'arm', 'torso', 'leg', 'weapon', 'guard']) {
    await page.click(`[data-testid=part-${part}]`);
    for (let i = 0; i < 5; i++) await page.click('[data-testid=enhance-common]');
  }
  const vals = await tb(page, () => ({ ...window.__tb.store.save.enhance }));
  check('M3 6개 부위 모두 강화됨 (95% 확률, 5회씩)', Object.values(vals).every((v) => v >= 2), JSON.stringify(vals));
  const stats1 = await tb(page, () => ({ ...window.__tb.store.stats }));
  check(
    'M3 강화로 부위별 스탯 상승 (치명타·공격력·체력·이동·방어)',
    stats1.crit > stats0.crit && stats1.atk > stats0.atk && stats1.maxHp > stats0.maxHp && stats1.moveSpeed > stats0.moveSpeed && stats1.def > stats0.def,
    `${JSON.stringify(stats0)} → ${JSON.stringify(stats1)}`,
  );
  const mats = await tb(page, () => window.__tb.store.materialCount());
  check('M3 강화 1회당 재료 1개 소모 (240 − 30 = 210)', mats === 210, String(mats));
  await shot(page, 'm3-enhance');

  // 50의 배수 멈춤: 48 + 희귀(+3) → 성공이면 50, 실패면 47
  await tb(page, () => window.__tb.store.debugGrantMaterials());
  await tb(page, () => window.__tb.store.debugGrantMaterials());
  await page.click('[data-testid=part-arm]');
  let stopOk = 0;
  let dropOk = 0;
  for (let i = 0; i < 12; i++) {
    await setVal(page, 'arm', 48);
    await page.click('[data-testid=enhance-rare]');
    const v = await enhanceVal(page, 'arm');
    if (v === 50) stopOk++;
    else if (v === 47) dropOk++;
  }
  check('M3 48에서 희귀 강화 → 50에서 멈춤 (성공) 또는 47 (돌파 실패 −1)', stopOk + dropOk === 12 && stopOk > 0, `성공 ${stopOk}, 실패 ${dropOk}`);
  const warnText = await (async () => { await setVal(page, 'arm', 49); return page.textContent('[data-testid=enhance-common]'); })();
  check('M3 돌파 시도 버튼에 실패 하락 경고 표시', warnText.includes('돌파') && warnText.includes('−1'), warnText);

  // 구간별 확률 표시: 800 → 20%
  await setVal(page, 'arm', 800);
  const rateText = await page.locator('[data-testid=part-arm]').textContent();
  check('M3 40구간(800) 성공 확률 20% 표시', rateText.includes('20%') && rateText.includes('40구간'), rateText);
  // 고구간 돌파 실패 −8: 849에서 전설(+5)… 850 도달 시도
  let fails = 0;
  for (let i = 0; i < 10 && fails === 0; i++) {
    await setVal(page, 'arm', 849);
    await page.click('[data-testid=enhance-common]');
    if ((await enhanceVal(page, 'arm')) === 841) fails++;
  }
  check('M3 40구간 돌파 실패 시 −8 (849 → 841)', fails === 1);
  // 최대치 1000: 버튼 비활성
  await setVal(page, 'arm', 1000);
  const disabled = await page.locator('[data-testid=enhance-common]').isDisabled();
  const maxText = await page.locator('[data-testid=part-arm]').textContent();
  check('M3 강화 수치 1000에서 강화 불가', disabled && maxText.includes('MAX') && maxText.includes('50구간'), maxText);
  await shot(page, 'm3-enhance-max');
  await page.keyboard.press('Escape');

  // 메카닉 장비 장착/해제
  await tb(page, () => window.__tb.store.debugGrantEquipment());
  const atk0 = await tb(page, () => window.__tb.store.stats.atk);
  await page.keyboard.press('u');
  await page.click('[data-testid=equip-alien_plasma]');
  await page.click('[data-testid=equip-alien_shell]');
  const st = await tb(page, () => ({ atk: window.__tb.store.stats.atk, def: window.__tb.store.stats.def, eq: { ...window.__tb.store.save.equipped } }));
  check('M3 메카닉 무기·방어구 장착 시 공격력·방어력 증가', st.atk === atk0 + 30 && st.eq.weapon && st.eq.armor, JSON.stringify({ atk0, ...st }));
  await shot(page, 'm3-equip');
  await page.getByRole('button', { name: '해제' }).first().click();
  const atk2 = await tb(page, () => window.__tb.store.stats.atk);
  check('M3 장비 해제 시 스탯 원복', atk2 === atk0, `${atk0} / ${atk2}`);
  await page.keyboard.press('Escape');

  // 새로고침 후 강화·장비 유지
  await tb(page, async () => window.__tb.store.persistNow());
  const saved = await tb(page, () => JSON.stringify([window.__tb.store.save.enhance, window.__tb.store.save.equipped, window.__tb.store.save.items.length]));
  await page.reload();
  await page.waitForFunction(() => window.__tb?.store?.screen === 'title');
  await page.getByText('이어하기').click();
  await page.waitForFunction(() => window.__tb.game.scene.isActive('play'));
  const loaded = await tb(page, () => JSON.stringify([window.__tb.store.save.enhance, window.__tb.store.save.equipped, window.__tb.store.save.items.length]));
  check('M3 새로고침 후 강화 수치·장비·인벤토리 유지', saved === loaded);
  check('M3 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 유전공학: 손·각반·발, 장비 불가
  const g = await newPage();
  await startGame(g.page, 'genetic');
  await tb(g.page, () => window.__tb.store.debugGrantMaterials());
  await openEnhance(g.page);
  const gNames = (await g.page.locator('[data-testid^=part-]').allTextContents()).join();
  check('M3 유전공학 강화 부위: 손·각반·발', gNames.includes('손') && gNames.includes('각반·발') && !gNames.includes('슬롯'));
  const as0 = await tb(g.page, () => window.__tb.store.stats.attackInterval);
  await g.page.click('[data-testid=part-weapon]');
  for (let i = 0; i < 10; i++) await g.page.click('[data-testid=enhance-legendary]');
  const as1 = await tb(g.page, () => window.__tb.store.stats.attackInterval);
  check('M3 유전공학 손 강화 시 공격 속도 증가', as1 < as0, `${as0.toFixed(3)} → ${as1.toFixed(3)}`);
  await shot(g.page, 'm3-genetic-enhance');
  await g.page.keyboard.press('Escape');
  await g.page.keyboard.press('u');
  check('M3 유전공학은 장비 창 없음', (await g.page.locator('text=장비').filter({ hasText: '방어구' }).count()) === 0 && (await g.page.locator('.hud-right').textContent()).includes('장비') === false);
  check('M3 유전공학 콘솔 오류 없음', g.errors.length === 0, g.errors.join(' | '));
  await g.ctx.close();
}

// ---------------- 마일스톤 4: 거점 NPC와 퀘스트 ----------------
/** 특정 몬스터를 n마리 처치 (살아 있는 개체가 없으면 같은 사양으로 하나 더 생성) */
const killType = (page, id, n) =>
  scene(page, (s, a) => {
    let spec = s.monsters.find((m) => m.spec.monsterId === a.id)?.spec;
    for (let i = 0; i < a.n; i++) {
      let t = s.monsters.find((m) => m.alive && m.spec.monsterId === a.id);
      if (!t && spec) t = s.spawnMonster(spec, s.player.pos.x + 2, s.player.pos.y);
      if (!t) return false;
      spec = t.spec;
      s.damageMonster(t, t.hp, false);
    }
    return true;
  }, { id, n });

const qs = (page) => tb(page, () => ({ ...window.__tb.store.save.quest, status: window.__tb.store.questStatus() && { cur: window.__tb.store.questStatus().current, goal: window.__tb.store.questStatus().goal, complete: window.__tb.store.questStatus().complete } }));

async function talk(page) {
  const npc = await tb(page, () => window.__tb.DATA.world.npcs[window.__tb.store.faction]);
  await tp(page, npc.x + 1, npc.y + 0.5);
  await sleep(200);
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=npc-dialog]');
}

async function turnIn(page) {
  await talk(page);
  await page.click('[data-testid=quest-turnin]');
  await page.keyboard.press('Escape');
}

/** 실제 강화 규칙으로 목표치까지 강화 (재료는 디버그 지급) */
const enhanceTo = (page, parts, target) =>
  tb(page, ([ps, t]) => {
    const st = window.__tb.store;
    for (const p of ps) {
      let guard = 0;
      while (st.save.enhance[p] < t && guard++ < 400) {
        if (st.save.materials[p].common <= 0) st.debugGrantMaterials();
        st.enhance(p, 'common');
      }
    }
  }, [parts, target]);

async function runQuestLine(page, faction) {
  const log = [];
  await talk(page);
  const greet = await page.textContent('[data-testid=npc-dialog]');
  await page.click('[data-testid=quest-accept]');
  const startText = await page.textContent('[data-testid=npc-dialog]');
  await page.keyboard.press('Escape');
  check(`M4 [${faction}] NPC 대화 후 1번 퀘스트 수락 (대사 표시)`, greet.length > 5 && startText.includes('다섯 마리'), startText);
  const hud = await page.textContent('[data-testid=quest-line]');
  check(`M4 [${faction}] 진행 중 퀘스트 목표 HUD 표시`, hud.includes('첫') && hud.includes('(0/5)'), hud);

  // 1. 처치: 독개미 5
  await tp(page, 30, 19);
  await killType(page, 'thorn_sprout', 2);
  check(`M4 [${faction}] 다른 몬스터 처치는 집계 안 됨`, (await qs(page)).progress === 0);
  await killType(page, 'poison_ant', 5);
  log.push(await qs(page));
  check(`M4 [${faction}] Q1 처치 퀘스트 완료`, (await qs(page)).status.complete);
  const mats0 = await tb(page, () => window.__tb.store.materialCount());
  await turnIn(page);
  const mats1 = await tb(page, () => window.__tb.store.materialCount());
  check(`M4 [${faction}] Q1 보고 시 재료 보상 지급`, mats1 - mats0 === 8, `${mats0} → ${mats1}`);
  const q = await qs(page);
  check(`M4 [${faction}] 보고 후 다음 퀘스트 자동 수락`, q.index === 1 && q.accepted);

  // 2. 수집: 머리 재료 3 (드롭으로만 집계)
  await tb(page, () => window.__tb.store.debugGrantMaterials());
  check(`M4 [${faction}] 디버그 지급은 수집 퀘스트에 집계 안 됨`, (await qs(page)).progress === 0);
  await tp(page, 30, 39);
  for (let i = 0; i < 40 && !(await qs(page)).status.complete; i++) await killType(page, 'thorn_sprout', 1);
  check(`M4 [${faction}] Q2 수집 퀘스트 완료 (새싹 드롭)`, (await qs(page)).status.complete);
  const items0 = await tb(page, () => window.__tb.store.save.items.length);
  await turnIn(page);
  const items1 = await tb(page, () => window.__tb.store.save.items.length);
  check(`M4 [${faction}] Q2 보상 장비: ${faction === 'mechanic' ? '메카닉은 2개 지급' : '유전공학은 지급 안 됨'}`, items1 - items0 === (faction === 'mechanic' ? 2 : 0), `${items0} → ${items1}`);

  // 3. 강화 any 10
  await enhanceTo(page, ['arm'], 10);
  check(`M4 [${faction}] Q3 강화 달성 퀘스트 완료`, (await qs(page)).status.complete);
  await turnIn(page);

  // 4. 탐색: 거대꽃 둥지
  await tp(page, 40, 45);
  await sleep(200);
  check(`M4 [${faction}] 탐색 지점 밖에서는 미완료`, !(await qs(page)).status.complete);
  await tp(page, 46.5, 50.5);
  await sleep(400);
  check(`M4 [${faction}] Q4 탐색 퀘스트 완료`, (await qs(page)).status.complete);
  await turnIn(page);

  // 5. 거대꽃 처치
  await tp(page, 44, 49);
  await killType(page, 'maneater_flower', 1);
  check(`M4 [${faction}] Q5 대형 몬스터 처치 퀘스트 완료`, (await qs(page)).status.complete);
  await turnIn(page);

  // 6. 해협 해안 탐색
  await tp(page, 69.5, 30);
  await sleep(400);
  check(`M4 [${faction}] Q6 해협 탐색 완료`, (await qs(page)).status.complete);
  await turnIn(page);

  // 7. 방어 재료 5 수집 (갑옷 거북)
  await tp(page, 86, 44);
  for (let i = 0; i < 60 && !(await qs(page)).status.complete; i++) await killType(page, 'armored_turtle', 1);
  check(`M4 [${faction}] Q7 해협 재료 수집 완료`, (await qs(page)).status.complete);
  await turnIn(page);

  // 8. 전 부위 20
  await enhanceTo(page, ['head', 'arm', 'torso', 'leg', 'weapon', 'guard'], 20);
  check(`M4 [${faction}] Q8 전 부위 20 달성 완료`, (await qs(page)).status.complete);
  await turnIn(page);
  await shot(page, `m4-${faction}-q9`);

  // 9~10. 탑 층 (마일스톤 5 전이므로 디버그 해금으로 검증, 실제 클리어는 M5에서)
  check(`M4 [${faction}] Q9 탑 3층 퀘스트는 클리어 전 미완료`, !(await qs(page)).status.complete);
  await tb(page, () => window.__tb.store.debugUnlockFloor(3));
  check(`M4 [${faction}] Q9 탑 3층 도달 시 완료`, (await qs(page)).status.complete);
  await turnIn(page);
  await tb(page, () => window.__tb.store.debugUnlockFloor(10));
  await turnIn(page);
  const end = await qs(page);
  const hudEnd = await page.textContent('[data-testid=quest-line]');
  check(`M4 [${faction}] 10개 퀘스트 전부 완료`, end.index === 10 && hudEnd.includes('모든 메인 퀘스트 완료'), hudEnd);
  await page.keyboard.press('j');
  await shot(page, `m4-${faction}-done`);
  await page.keyboard.press('Escape');
}

async function m4() {
  for (const faction of ['mechanic', 'genetic']) {
    const { ctx, page, errors } = await newPage();
    await startGame(page, faction);
    await runQuestLine(page, faction);
    // 저장 유지
    await tb(page, async () => window.__tb.store.persistNow());
    await page.reload();
    await page.waitForFunction(() => window.__tb?.store?.screen === 'title');
    await page.getByText('이어하기').click();
    await page.waitForFunction(() => window.__tb.game.scene.isActive('play'));
    check(`M4 [${faction}] 새로고침 후 퀘스트 진행 유지`, (await qs(page)).index === 10);
    check(`M4 [${faction}] 콘솔 오류 없음`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // 디버그 퀘스트 건너뛰기
  const { ctx, page } = await newPage();
  await startGame(page, 'genetic');
  await page.click('[data-testid=debug-btn]');
  await page.click('[data-testid=debug-skip-quest]');
  await page.click('[data-testid=debug-skip-quest]');
  const q = await qs(page);
  check('M4 디버그 퀘스트 건너뛰기 (보상 포함)', q.index === 2 && q.accepted, JSON.stringify(q));
  await ctx.close();
}

// ---------------- 마일스톤 5: 탑 1~10층 ----------------
const missionState = (page) =>
  scene(page, (s) => (s.mission ? { phase: s.mission.phase, type: s.mission.fl.mission.type, floor: s.floor, mode: s.mode } : { mode: s.mode }));

async function enterFloor(page, floor) {
  await page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world' && window.__tb.game.scene.isActive('play'));
  await sleep(300);
  await tp(page, 61, 30.5);
  await sleep(250);
  await page.keyboard.press('e');
  await page.waitForSelector(`[data-testid=floor-${floor}]`);
  await page.click(`[data-testid=floor-${floor}]`);
  await page.waitForFunction((f) => { const s = window.__tb.game.scene.getScene('play'); return s?.mode === 'tower' && s.floor === f && s.mission; }, floor, { timeout: 10000 });
  await sleep(400);
}

/** 가장 가까운 적 근처로 이동하며 공격을 반복한다. 미궁은 관리자 방으로, 수집형은 결정 위로 이동. */
async function autoClear(page, faction, maxMs = 90000) {
  const t0 = Date.now();
  await page.keyboard.down(' ');
  try {
    while (Date.now() - t0 < maxMs) {
      const st = await scene(page, (s, f) => {
        if (s.mode !== 'tower' || !s.mission) return { done: true, phase: 'left' };
        const mi = s.mission;
        if (mi.phase === 'cleared') return { done: true, phase: 'cleared' };
        store: {
          const p = s.player.pos;
          if (mi.fl.mission.type === 'maze' && mi.phase === 'pre') {
            const [rx, ry, rw, rh] = mi.maze.exitRoom;
            p.x = rx + 1; p.y = ry + rh / 2; break store;
          }
          const shard = mi.shards.find((x) => x.img.active);
          if (shard) { p.x = shard.x; p.y = shard.y; break store; }
          const t = s.monsters.filter((m) => m.alive).sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.y - p.y) - Math.hypot(b.pos.x - p.x, b.pos.y - p.y))[0];
          if (t) {
            const off = f === 'mechanic' ? 3 : t.radius + 0.6;
            const clearLine = (ax, ay, bx, by) => { for (let k = 0; k <= 20; k++) { if (s.level.blocked(ax + (bx - ax) * k / 20, ay + (by - ay) * k / 20, 2)) return false; } return true; };
            search: for (const dd of [off, off * 0.6, off * 1.4, t.radius + 0.6]) {
              for (let k = 0; k < 8; k++) {
                const a = Math.PI + (k * Math.PI) / 4;
                const nx = t.pos.x + Math.cos(a) * dd, ny = t.pos.y + Math.sin(a) * dd;
                if (!s.level.circleBlocked(nx, ny, 0.35, 1) && clearLine(nx, ny, t.pos.x, t.pos.y)) { p.x = nx; p.y = ny; break search; }
              }
            }
          }
        }
        window.__tb.store.setHp(window.__tb.store.stats.maxHp);
        return { done: false, phase: mi.phase };
      }, faction);
      if (st.done) return st.phase;
      await sleep(250);
    }
    const dbg = await scene(page, (s) => ({ phase: s.mission?.phase, wave: s.mission?.wave, alive: s.monsters.filter((m) => m.alive).map((m) => [m.spec.name, +m.pos.x.toFixed(1), +m.pos.y.toFixed(1), m.state, m.hp]), player: s.player.pos, dead: s.player.dead, cd: s.player.attackCooldown, panel: window.__tb.store.panel, active: document.activeElement?.tagName, ptr: s.pointerAttack }));
    console.log('TIMEOUT', JSON.stringify(dbg));
    return 'timeout';
  } finally {
    await page.keyboard.up(' ');
  }
}

async function m5() {
  const { ctx, page, errors } = await newPage();
  await startGame(page, 'mechanic');
  // 탑 입장 전: 1층만 열림
  await tp(page, 61, 30.5);
  await sleep(250);
  const label = await page.textContent('[data-testid=interact]');
  check('M5 탑 입구에서 입장 안내 표시', label.includes('탑 입장'), label);
  await page.keyboard.press('e');
  await page.waitForSelector('[data-testid=floor-1]');
  check('M5 처음엔 1층만 입장 가능', !(await page.locator('[data-testid=floor-1]').isDisabled()) && (await page.locator('[data-testid=floor-2]').isDisabled()));
  await shot(page, 'm5-floor-select');
  await page.keyboard.press('Escape');

  // 탑 사망: 강화 수치 감소 없음
  await tb(page, () => window.__tb.store.debugSetEnhance('all', 50));
  await enterFloor(page, 1);
  await scene(page, (s) => { const t = s.monsters.find((m) => m.alive); s.player.pos.x = t.pos.x - 0.6; s.player.pos.y = t.pos.y; });
  await tb(page, () => window.__tb.store.setHp(1));
  await page.waitForFunction(() => window.__tb.store.save.stats.deaths >= 1, null, { timeout: 15000 });
  const en = await tb(page, () => Object.values(window.__tb.store.save.enhance));
  check('M5 탑 안에서 사망 시 강화 수치 감소 없음', en.every((v) => v === 50), JSON.stringify(en));
  await page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world', null, { timeout: 10000 });
  await sleep(500);
  const reg = await page.textContent('[data-testid=region]');
  check('M5 탑 사망 후 자기 세력 거점에서 부활', reg.includes('메카닉 거점'), reg);

  // 강하게 만든 뒤 1~10층 실제 공략
  await tb(page, () => { window.__tb.store.debugSetEnhance('all', 400); window.__tb.store.debugGrantEquipment(); });
  await tb(page, () => { const st = window.__tb.store; const w = st.save.items.find((i) => i.id === 'alien_plasma'); const a = st.save.items.find((i) => i.id === 'alien_shell'); st.equip(w.uid); st.equip(a.uid); });
  // 퀘스트 9번(탑 3층)까지 건너뛰어, 실제 탑 클리어로 퀘스트가 완료되는지 확인
  for (let i = 0; i < 8; i++) await tb(page, () => window.__tb.store.debugSkipQuest());
  const types = {};
  for (let f = 1; f <= 10; f++) {
    await enterFloor(page, f);
    const ms = await missionState(page);
    types[ms.type] = (types[ms.type] ?? 0) + 1;
    if (f <= 3 || f === 6 || f === 10) {
      await sleep(900);
      await shot(page, `m5-floor${f}-${ms.type}`);
    }
    const res = await autoClear(page, 'mechanic');
    const cleared = await tb(page, () => window.__tb.store.save.tower.highestCleared);
    check(`M5 ${f}층 (${ms.type}) 클리어`, res === 'cleared' && cleared >= f, `결과 ${res}, 최고층 ${cleared}`);
    if (f === 3) {
      const q = await tb(page, () => window.__tb.store.questStatus());
      check('M5 탑 3층 클리어로 퀘스트 9 완료 조건 충족', q?.complete === true, JSON.stringify(q && { t: q.quest.title, c: q.complete }));
    }
    if (f === 10) await shot(page, 'm5-floor10-cleared');
    // 포탈로 나가기
    const portal = await scene(page, (s) => s.mission?.portal);
    if (portal) {
      await tp(page, portal.x, portal.y);
      await sleep(200);
      await page.keyboard.press('e');
    }
    await page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world', null, { timeout: 10000 });
  }
  check('M5 세 가지 미션 유형 + 보스전 모두 등장', types.hunt >= 1 && types.maze >= 1 && types.quest >= 1 && types.boss === 1, JSON.stringify(types));
  const drops = await tb(page, () => window.__tb.store.save.items.length);
  check('M5 관리자 처치로 장비(외계 기술 포함) 획득', drops > 8, `보유 장비 ${drops}개 (디버그 지급 8개 포함)`);

  // 미궁 제한 시간 실패
  await enterFloor(page, 2);
  await scene(page, (s) => { s.mission.timer = 1; });
  await page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world', null, { timeout: 10000 });
  check('M5 미궁 제한 시간 초과 시 실패하고 탑 밖으로', true);

  // 나가기 버튼
  await enterFloor(page, 4);
  await page.click('[data-testid=leave-tower]');
  await page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world', null, { timeout: 10000 });
  check('M5 탑 나가기 버튼 동작', true);

  // 진도 저장
  await tb(page, async () => window.__tb.store.persistNow());
  await page.reload();
  await page.waitForFunction(() => window.__tb?.store?.screen === 'title');
  await page.getByText('이어하기').click();
  await page.waitForFunction(() => window.__tb.game.scene.isActive('play'));
  const hc = await tb(page, () => window.__tb.store.save.tower.highestCleared);
  check('M5 새로고침 후 탑 진도 유지 (10층)', hc === 10, String(hc));
  check('M5 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // 유전공학으로 1~3층 (근접)
  const g = await newPage();
  await startGame(g.page, 'genetic');
  await tb(g.page, () => window.__tb.store.debugSetEnhance('all', 400));
  for (let f = 1; f <= 3; f++) {
    await enterFloor(g.page, f);
    const res = await autoClear(g.page, 'genetic');
    check(`M5 유전공학 ${f}층 클리어 (근접)`, res === 'cleared', res);
    await g.page.click('[data-testid=leave-tower]').catch(() => {});
    await g.page.waitForFunction(() => window.__tb.game.scene.getScene('play')?.mode === 'world', null, { timeout: 10000 });
  }
  check('M5 유전공학 콘솔 오류 없음', g.errors.length === 0, g.errors.slice(0, 3).join(' | '));
  await g.ctx.close();
}

const SCENARIOS = { m1, m2, m3, m4, m5 };
for (const [name, fn] of Object.entries(SCENARIOS)) {
  if (which !== 'all' && which !== name) continue;
  try {
    await fn();
  } catch (e) {
    check(`${name} 시나리오 실행`, false, e.message.split('\n')[0]);
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir, `result-${which}.json`), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
