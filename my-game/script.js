'use strict';

/* =========================================================
   햄스터 서바이벌 — 오염된 도시에서 살아남는 햄스터 사냥 RPG
   ========================================================= */

// ---------- 게임 설정 ----------
const WORLD_W = 3200;
const WORLD_H = 3200;
const CENTER = { x: WORLD_W / 2, y: WORLD_H / 2 };
const SAVE_KEY = 'hamster-survival-save-v1';
const TEST_MODE = new URLSearchParams(location.search).has('test');

const BOSS_LEVEL = 20;
const POINTS_PER_LEVEL = 3;
const DEATH_EXP_LOSS = 0.3;    // 쓰러지면 현재 경험치의 30% 손실 (레벨은 내려가지 않음)
const SAFE_R = 110;            // 세이브 포인트 안전지대 반경
const PLAYER_R = 20;
const ATTACK_COOLDOWN = 0.38;  // 초
const ATTACK_REACH = 52;
const MAX_MONSTERS = 26;
const CHEST_COUNT = 14;
const CHEST_RESPAWN = 45;      // 열린 상자가 다른 곳에 다시 생기기까지(초)
const DROP_CHANCE = 0.18;      // 몬스터 장비 드랍 확률

// 햄스터 4종 기본 스탯 (spd = 초당 이동 픽셀)
const HAMSTERS = {
  striped: { name: '줄무늬 햄스터',   desc: '균형형',                     hp: 100, atk: 10, def: 5,  spd: 180 },
  chubby:  { name: '뚱뚱한 햄스터',   desc: '체력·방어 높음, 이동속도 느림', hp: 150, atk: 9,  def: 10, spd: 135 },
  swift:   { name: '날쌘 햄스터',     desc: '이동속도 빠름, 체력 낮음',     hp: 70,  atk: 10, def: 4,  spd: 245 },
  cheeky:  { name: '볼주머니 햄스터', desc: '공격력 높음, 방어 낮음',       hp: 95,  atk: 16, def: 2,  spd: 175 },
};

// 스탯 포인트 1점당 증가량
const STAT_KEYS = ['atk', 'def', 'hp', 'spd'];
const STAT_PER_POINT = { atk: 2, def: 1, hp: 12, spd: 8 };
const STAT_LABEL = { atk: '공격력', def: '방어력', hp: '체력', spd: '이동속도' };
const STAT_ICON = { atk: '⚔️', def: '🛡️', hp: '❤️', spd: '👟' };

const RARITY = [
  { key: 'common', label: '일반', mult: 1.0, prefix: '낡은' },
  { key: 'rare',   label: '희귀', mult: 1.5, prefix: '반짝이는' },
  { key: 'legend', label: '전설', mult: 2.2, prefix: '전설의' },
];
const CHEST_RARITY = [0.60, 0.30, 0.10];  // 일반/희귀/전설 확률
const DROP_RARITY  = [0.72, 0.23, 0.05];

const WEAPONS = [
  ['🥢', '젓가락 창'], ['🗡️', '이쑤시개 검'], ['🔨', '장난감 망치'], ['🪓', '손도끼'],
  ['🏏', '야구 방망이'], ['🔱', '포크 삼지창'], ['🪄', '마법 빨대'],
];
const ARMORS = [
  ['🧦', '양말 갑옷'], ['🦺', '안전 조끼'], ['🧥', '털 코트'], ['🥼', '방호복'],
  ['🛡️', '병뚜껑 방패'], ['⛑️', '안전모'],
];

// 레벨 1, 5, 10, 15에 등장하는 몬스터 4종
const MONSTERS = [
  { id: 'slime', name: '오염 슬라임',       emoji: '🦠', unlock: 1,  hp: 30,  atk: 8,  def: 0,  spd: 55,  exp: 12,  r: 20, aggro: 260 },
  { id: 'roach', name: '돌연변이 바퀴벌레', emoji: '🪳', unlock: 5,  hp: 75,  atk: 17, def: 4,  spd: 95,  exp: 28,  r: 20, aggro: 300 },
  { id: 'rat',   name: '오염된 시궁쥐',     emoji: '🐀', unlock: 10, hp: 170, atk: 30, def: 9,  spd: 115, exp: 60,  r: 24, aggro: 330 },
  { id: 'cat',   name: '오염된 들고양이',   emoji: '🐈', unlock: 15, hp: 330, atk: 46, def: 15, spd: 120, exp: 120, r: 28, aggro: 360 },
];
const BOSS = { name: '오염된 퍼실몹', hp: 4000, atk: 75, def: 20, spd: 75, r: 70, bulletAtk: 50 };

// 맵에 고정된 세이브 포인트(⛺). 0번이 시작 지점
const SAVE_POINTS = [
  { x: 1600, y: 2850, name: '남쪽 시작 둥지' },
  { x: 450,  y: 450,  name: '북서 공원 둥지' },
  { x: 2750, y: 450,  name: '북동 공장 둥지' },
  { x: 450,  y: 2750, name: '남서 시장 둥지' },
  { x: 2750, y: 2750, name: '남동 항구 둥지' },
  { x: 1600, y: 650,  name: '북쪽 광장 둥지' },
];
const ROADS = [800, 1600, 2400];

const expNeed = (lv) => Math.round(15 + lv * 10 + lv * lv);

// ---------- 유틸 ----------
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hpClass = (r) => (r > 0.5 ? 'hp-high' : r > 0.25 ? 'hp-mid' : 'hp-low');
const hpWord = (r) => (r > 0.5 ? '양호' : r > 0.25 ? '주의' : '위험!');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setText(el, txt) {
  if (el._t !== txt) { el._t = txt; el.textContent = txt; }
}

// ---------- 상태 ----------
let S = null;   // 저장되는 진행 상태
let P = null;   // 플레이어 런타임 상태
let G = null;   // 필드 런타임 상태
let selectedType = null;
let world, viewport;
let VW = 0, VH = 0, camX = 0, camY = 0;
const keys = {};
const joy = { id: null, vx: 0, vy: 0 };
let attackHeld = false;

// =========================================================
// 스탯
// =========================================================
function statParts() {
  const b = HAMSTERS[S.type];
  const base = { atk: b.atk, def: b.def, hp: b.hp, spd: b.spd };
  const alloc = {}, equip = {};
  for (const k of STAT_KEYS) {
    alloc[k] = S.alloc[k] * STAT_PER_POINT[k];
    equip[k] = (S.weapon?.[k] || 0) + (S.armor?.[k] || 0);
  }
  return { base, alloc, equip };
}
function stats() {
  const p = statParts();
  const t = {};
  for (const k of STAT_KEYS) t[k] = p.base[k] + p.alloc[k] + p.equip[k];
  t.spd = Math.min(t.spd, 420);
  return t;   // t.hp = 최대 체력
}
function calcDmg(atk, def) {
  const raw = Math.max(atk - def * 0.5, atk * 0.15);
  return Math.max(1, Math.round(raw * rand(0.9, 1.1)));
}
// 최대 체력이 늘어나면 늘어난 만큼 현재 체력도 채워준다
function withMaxHpChange(fn) {
  const before = stats().hp;
  fn();
  const after = stats().hp;
  P.hp = clamp(P.hp + Math.max(0, after - before), 1, after);
}

// =========================================================
// 장비
// =========================================================
function rollRarity(table) {
  const r = Math.random();
  if (r < table[2]) return 2;
  if (r < table[2] + table[1]) return 1;
  return 0;
}
function makeItem(slot, lvl, rarity) {
  const R = RARITY[rarity];
  const [emoji, baseName] = pick(slot === 'weapon' ? WEAPONS : ARMORS);
  const v = rand(0.85, 1.15);
  const it = { slot, emoji, name: `${R.prefix} ${baseName}`, rarity, lvl, atk: 0, def: 0, hp: 0, spd: 0 };
  if (slot === 'weapon') {
    it.atk = Math.max(1, Math.round((3 + lvl * 1.6) * R.mult * v));
    if (rarity >= 1) it.spd = rarity * 8;
    if (rarity === 2) it.hp = Math.round(lvl * 3);
  } else {
    it.def = Math.max(1, Math.round((1 + lvl * 0.9) * R.mult * v));
    it.hp = Math.round((8 + lvl * 5) * R.mult * v);
    if (rarity === 2) it.spd = 10;
  }
  return it;
}
function itemStatList(it) {
  return STAT_KEYS.filter((k) => it[k]).map((k) => `${STAT_LABEL[k]} +${it[k]}`);
}
function rarityBadge(it) {
  const R = RARITY[it.rarity];
  return `<span class="rbadge ${R.key}">${R.label}</span>`;
}
function equipVisual(root) {
  const w = root.querySelector('.weapon-slot');
  const a = root.querySelector('.armor-slot');
  w.textContent = S.weapon ? S.weapon.emoji : '';
  w.className = 'weapon-slot' + (S.weapon ? ' r-' + RARITY[S.weapon.rarity].key : '');
  a.textContent = S.armor ? S.armor.emoji : '';
  a.className = 'armor-slot' + (S.armor ? ' r-' + RARITY[S.armor.rarity].key : '');
}

// =========================================================
// 햄스터 그림 (CSS 도형)
// =========================================================
function hamsterHTML(type) {
  return `<div class="ham ham-${type}">
    <div class="ear l"></div><div class="ear r"></div>
    <div class="hbody">
      <div class="stripe"></div><div class="belly"></div>
      <div class="eye l"></div><div class="eye r"></div>
      <div class="nose"></div><div class="mouth"></div>
      <div class="cheek l"></div><div class="cheek r"></div>
    </div>
    <div class="paw l"></div><div class="paw r"></div>
    <div class="armor-slot"></div>
    <div class="weapon-slot"></div>
  </div>`;
}

// =========================================================
// 세이브 / 불러오기 (localStorage)
// =========================================================
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !HAMSTERS[d.type]) return null;
    return {
      type: d.type,
      level: d.level || 1,
      exp: d.exp || 0,
      points: d.points || 0,
      alloc: Object.assign({ atk: 0, def: 0, hp: 0, spd: 0 }, d.alloc),
      weapon: d.weapon || null,
      armor: d.armor || null,
      savePoint: SAVE_POINTS[d.savePoint] ? d.savePoint : 0,
      playTime: d.playTime || 0,
      savedAt: d.savedAt || 0,
      cleared: false,
    };
  } catch (e) {
    return null;
  }
}
function saveGame() {
  if (G.nearSave < 0) {
    toast('⛺ 세이브 포인트 안전지대 안에서만 저장할 수 있어요', 'warn');
    return;
  }
  S.savePoint = G.nearSave;
  P.hp = stats().hp;
  const data = { ...S, savedAt: Date.now() };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    markCurrentSavePoint();
    toast(`💾 저장 완료! (${SAVE_POINTS[S.savePoint].name}) 쓰러지면 여기서 부활해요`);
  } catch (e) {
    toast('저장 실패: 브라우저 저장소를 사용할 수 없어요', 'warn');
  }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
}

// =========================================================
// 시작 화면
// =========================================================
function statRow(label, v, max) {
  return `<div class="ms-row"><span>${label}</span><div class="ms-bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div><b>${v}</b></div>`;
}
function buildStart() {
  selectedType = null;
  const wrap = $('hamster-choices');
  wrap.innerHTML = '';
  for (const [key, h] of Object.entries(HAMSTERS)) {
    const card = document.createElement('button');
    card.className = 'ham-card';
    card.innerHTML = `<div class="ham-preview">${hamsterHTML(key)}</div>
      <div class="ham-name">${h.name}</div>
      <div class="ham-desc">${h.desc}</div>
      <div class="mini-stats">
        ${statRow('체력', h.hp, 150)}${statRow('공격', h.atk, 16)}${statRow('방어', h.def, 10)}${statRow('속도', h.spd, 245)}
      </div>`;
    card.onclick = () => {
      selectedType = key;
      wrap.querySelectorAll('.ham-card').forEach((c) => c.classList.toggle('selected', c === card));
      $('btn-new').disabled = false;
      $('btn-new').textContent = `${h.name}로 새 게임 시작!`;
    };
    wrap.appendChild(card);
  }
  $('btn-new').disabled = true;
  $('btn-new').textContent = '햄스터를 선택하세요';

  const save = loadSave();
  $('continue-box').classList.toggle('hidden', !save);
  if (save) {
    const when = save.savedAt ? new Date(save.savedAt).toLocaleString('ko-KR') : '';
    $('continue-info').innerHTML =
      `<b>Lv.${save.level} ${HAMSTERS[save.type].name}</b><br>` +
      `⛺ ${SAVE_POINTS[save.savePoint].name}<br><small>저장: ${when}</small>`;
  }
}

// =========================================================
// 게임 시작
// =========================================================
function newGame(type) {
  S = {
    type, level: 1, exp: 0, points: 0,
    alloc: { atk: 0, def: 0, hp: 0, spd: 0 },
    weapon: null, armor: null,
    savePoint: 0, playTime: 0, cleared: false,
  };
  startWorld();
  toast('🐹 오염된 도시에 오신 걸 환영해요! 몬스터를 사냥하고 🎁 상자를 찾아보세요');
}
function continueGame() {
  S = loadSave();
  if (!S) { buildStart(); return; }
  startWorld();
  toast(`▶ 이어하기 — ${SAVE_POINTS[S.savePoint].name}에서 시작해요`);
}

function startWorld() {
  $('start-screen').classList.add('hidden');
  $('ending-screen').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('toasts').innerHTML = '';
  world.innerHTML = '';
  world.classList.remove('purified');
  for (const id of ['modal-compare', 'modal-equip', 'modal-stat', 'modal-death']) $(id).classList.add('hidden');

  G = {
    monsters: [], chests: [], drops: [], bullets: [], savePointEls: [],
    boss: null, spawnT: 0, chestTimers: [], pickQueue: [],
    modal: null, pendingStat: false, running: true, ending: false,
    nearSave: -1, frame: 0,
  };
  const sp = SAVE_POINTS[S.savePoint];
  P = { x: sp.x, y: sp.y + 100, hp: 1, fx: 0, fy: 1, left: false, moving: false, atkCd: 0, sinceHit: 99, dead: false, hurtT: 0 };
  P.hp = stats().hp;

  buildGround();
  buildSavePoints();
  createPlayer();
  for (let i = 0; i < CHEST_COUNT; i++) spawnChest();
  for (let i = 0; i < 18; i++) spawnMonster(true);
  if (S.level >= BOSS_LEVEL) spawnBoss(false);
  $('boss-bar').classList.toggle('hidden', !G.boss);
  $('test-panel').classList.toggle('hidden', !TEST_MODE);

  onResize();
  render();
  if (S.points > 0) { G.pendingStat = true; nextModal(); }
}

// =========================================================
// 맵 구성
// =========================================================
function addEnt(cls, html) {
  const d = document.createElement('div');
  d.className = 'ent ' + cls;
  d.innerHTML = html;
  world.appendChild(d);
  return d;
}
function place(el, x, y) {
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.zIndex = 10 + Math.round(y);
}
function onRoad(x, y, pad) {
  return ROADS.some((r) => Math.abs(x - r) < 60 + pad || Math.abs(y - r) < 60 + pad);
}

function buildGround() {
  for (const r of ROADS) {
    const h = document.createElement('div');
    h.className = 'road h'; h.style.top = (r - 60) + 'px';
    const v = document.createElement('div');
    v.className = 'road v'; v.style.left = (r - 60) + 'px';
    world.append(h, v);
  }
  const rng = mulberry32(20241027);
  // 오염 웅덩이
  for (let i = 0; i < 45; i++) {
    const x = 100 + rng() * (WORLD_W - 200), y = 100 + rng() * (WORLD_H - 200);
    if (SAVE_POINTS.some((sp) => Math.hypot(x - sp.x, y - sp.y) < 200)) continue;
    const w = 70 + rng() * 120;
    const d = document.createElement('div');
    d.className = 'puddle';
    Object.assign(d.style, { left: (x - w / 2) + 'px', top: (y - w * 0.3) + 'px', width: w + 'px', height: (w * 0.6) + 'px', animationDelay: (rng() * 3) + 's' });
    world.appendChild(d);
  }
  // 건물·나무·자동차 등 장식
  const DECO = [['🏚️', 70], ['🏢', 80], ['🏭', 76], ['🌳', 56], ['🌲', 56], ['🚗', 44], ['🛢️', 36], ['🗑️', 34], ['🚧', 38], ['🪨', 34]];
  let placed = 0;
  for (let i = 0; i < 400 && placed < 120; i++) {
    const x = 60 + rng() * (WORLD_W - 120), y = 80 + rng() * (WORLD_H - 120);
    const [e, size] = DECO[Math.floor(rng() * DECO.length)];
    if (onRoad(x, y, 30)) continue;
    if (SAVE_POINTS.some((sp) => Math.hypot(x - sp.x, y - sp.y) < SAFE_R + 70)) continue;
    if (Math.hypot(x - CENTER.x, y - CENTER.y) < 280) continue;
    const d = addEnt('deco', `<span style="font-size:${size}px">${e}</span>`);
    place(d, x, y);
    placed++;
  }
}

function buildSavePoints() {
  SAVE_POINTS.forEach((sp, i) => {
    const el = addEnt('savepoint', `<div class="safe-ring"></div><div class="tent">⛺</div><div class="sp-name">${sp.name}</div>`);
    place(el, sp.x, sp.y);
    el.style.zIndex = 3;
    G.savePointEls[i] = el;
  });
  markCurrentSavePoint();
}
function markCurrentSavePoint() {
  G.savePointEls.forEach((el, i) => el.classList.toggle('current', i === S.savePoint));
}

function createPlayer() {
  P.el = addEnt('player', `<div class="shadow"></div><div class="pwrap">${hamsterHTML(S.type)}</div><div class="hpbar"><i></i></div>`);
  P.bar = P.el.querySelector('.hpbar');
  P.fill = P.bar.querySelector('i');
  P.weaponEl = P.el.querySelector('.weapon-slot');
  equipVisual(P.el);
}

function randomFieldPos(minPlayerDist) {
  for (let i = 0; i < 40; i++) {
    const p = { x: rand(80, WORLD_W - 80), y: rand(80, WORLD_H - 80) };
    if (dist(p, P) < minPlayerDist) continue;
    if (SAVE_POINTS.some((sp) => dist(p, sp) < SAFE_R + 90)) continue;
    if (G.boss && dist(p, CENTER) < 400) continue;
    return p;
  }
  return null;
}

// =========================================================
// 몬스터 / 상자 / 드랍 / 보스 생성
// =========================================================
function spawnMonster(initial) {
  const avail = MONSTERS.filter((m) => m.unlock <= S.level);
  // 최근에 열린 몬스터일수록 조금 더 자주 등장
  let total = 0;
  avail.forEach((m, i) => (total += i + 1));
  let r = Math.random() * total, T = avail[0];
  for (let i = 0; i < avail.length; i++) { r -= i + 1; if (r <= 0) { T = avail[i]; break; } }

  const pos = randomFieldPos(initial ? 450 : 600);
  if (!pos) return;
  const el = addEnt('monster m-' + T.id, `<div class="shadow"></div><div class="mbody"><span>${T.emoji}</span></div><div class="hpbar"><i></i><span></span></div>`);
  const m = {
    T, x: pos.x, y: pos.y, hp: T.hp, maxHp: T.hp, el,
    bar: el.querySelector('.hpbar'), atkCd: 0, wt: 0, wvx: 0, wvy: 0, kb: 0, kbx: 0, kby: 0,
  };
  m.fill = m.bar.querySelector('i');
  m.txt = m.bar.querySelector('span');
  updateBar(m.bar, m.fill, m.txt, m.hp, m.maxHp);
  G.monsters.push(m);
}

function spawnChest() {
  const pos = randomFieldPos(300);
  if (!pos) { G.chestTimers.push(5); return; }
  const el = addEnt('chest', `<div class="cbody">🎁</div><div class="clabel">장비 상자</div>`);
  place(el, pos.x, pos.y);
  G.chests.push({ x: pos.x, y: pos.y, el });
}

function spawnDrop(x, y) {
  const slot = Math.random() < 0.5 ? 'weapon' : 'armor';
  const item = makeItem(slot, S.level, rollRarity(DROP_RARITY));
  const R = RARITY[item.rarity];
  const el = addEnt('drop r-' + R.key, `<div class="dbody">${item.emoji}</div><div class="dlabel">[${R.label}] ${item.name}</div>`);
  place(el, x, y);
  G.drops.push({ x, y, el, item });
}

function spawnBoss(announce) {
  if (G.boss || S.cleared) return;
  // 보스 주변 몬스터 정리
  for (const m of [...G.monsters]) if (dist(m, CENTER) < 400) removeMonster(m);
  const el = addEnt('boss', `
    <div class="bbody">
      <div class="bcrown">☣️</div>
      <div class="beye l"></div><div class="beye r"></div>
      <div class="bmouth"></div>
      <div class="bdrip d1"></div><div class="bdrip d2"></div><div class="bdrip d3"></div>
    </div>
    <div class="bname">👑 ${BOSS.name}</div>
    <div class="hpbar"><i></i><span></span></div>`);
  const b = { x: CENTER.x, y: CENTER.y, hp: BOSS.hp, maxHp: BOSS.hp, el, atkCd: 0, shotT: 3, rage: false };
  b.bar = el.querySelector('.hpbar');
  b.fill = b.bar.querySelector('i');
  b.txt = b.bar.querySelector('span');
  G.boss = b;
  updateBossBars();
  $('boss-bar').classList.remove('hidden');
  if (announce) toast(`⚠️ 맵 중앙에 보스 '${BOSS.name}'이 나타났어요!`, 'big');
}

// =========================================================
// 체력바 / HUD
// =========================================================
function updateBar(bar, fill, txt, hp, max) {
  const r = clamp(hp / max, 0, 1);
  const cls = hpClass(r);
  if (bar._c !== cls) { bar.classList.remove('hp-high', 'hp-mid', 'hp-low'); bar.classList.add(cls); bar._c = cls; }
  fill.style.width = (r * 100) + '%';
  if (txt) setText(txt, `${Math.ceil(Math.max(0, hp))}/${max}`);
}
function updateBossBars() {
  const b = G.boss;
  if (!b) return;
  updateBar(b.bar, b.fill, b.txt, b.hp, b.maxHp);
  $('boss-hp-fill').style.width = (clamp(b.hp / b.maxHp, 0, 1) * 100) + '%';
  setText($('boss-hp-text'), `${Math.ceil(Math.max(0, b.hp))} / ${b.maxHp}${b.rage ? ' · 분노!' : ''}`);
}
function updateHUD() {
  const st = stats();
  const r = clamp(P.hp / st.hp, 0, 1);
  setText($('hud-level'), String(S.level));
  const hpBar = $('hud-hp');
  updateBar(hpBar, $('hud-hp-fill'), null, P.hp, st.hp);
  setText($('hud-hp-text'), `HP ${Math.ceil(Math.max(0, P.hp))}/${st.hp} · ${hpWord(r)}`);
  const need = expNeed(S.level);
  $('hud-exp-fill').style.width = (clamp(S.exp / need, 0, 1) * 100) + '%';
  setText($('hud-exp-text'), `EXP ${S.exp}/${need}`);
  const badge = $('stat-badge');
  badge.classList.toggle('hidden', S.points <= 0);
  setText(badge, String(S.points));
  $('btn-stat').classList.toggle('has-points', S.points > 0);
  $('btn-save').classList.toggle('ready', G.nearSave >= 0);
  $('save-prompt').classList.toggle('hidden', G.nearSave < 0);
  if (G.nearSave >= 0) setText($('save-prompt-name'), SAVE_POINTS[G.nearSave].name);
}

// =========================================================
// 이펙트 / 알림
// =========================================================
function fx(cls, x, y, html, life) {
  const el = addEnt(cls, html);
  place(el, x, y);
  el.style.zIndex = 99999;
  setTimeout(() => el.remove(), life);
  return el;
}
const floatText = (x, y, text, kind) => fx('float ' + kind, x + rand(-8, 8), y, `<span>${text}</span>`, 900);
const poof = (x, y, emoji = '💨') => fx('poof', x, y, `<span>${emoji}</span>`, 500);

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  const box = $('toasts');
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.classList.add('out'), kind === 'big' ? 3600 : 2600);
  setTimeout(() => t.remove(), kind === 'big' ? 4000 : 3000);
}

// =========================================================
// 전투
// =========================================================
function rollHit(atk, def) {
  const crit = Math.random() < 0.1;
  let d = calcDmg(atk, def);
  if (crit) d = Math.round(d * 1.6);
  return { d, crit };
}

function doAttack() {
  if (P.atkCd > 0 || P.dead) return;
  P.atkCd = ATTACK_COOLDOWN;
  const st = stats();

  // 가까운 적이 있으면 그쪽으로 자동 조준 (모바일 편의)
  let target = null, best = 120;
  for (const m of G.monsters) { const d = dist(m, P) - m.T.r; if (d < best) { best = d; target = m; } }
  if (G.boss && dist(G.boss, P) - BOSS.r < best) target = G.boss;
  if (target) {
    const d = dist(target, P) || 1;
    P.fx = (target.x - P.x) / d; P.fy = (target.y - P.y) / d;
    if (Math.abs(P.fx) > 0.05) P.left = P.fx < 0;
  }

  const cx = P.x + P.fx * 36, cy = P.y - 20 + P.fy * 36;
  fx('slash', cx, cy, `<div style="transform: rotate(${Math.atan2(P.fy, P.fx)}rad)"><div class="arc"></div></div>`, 220);
  P.weaponEl.classList.remove('swing');
  void P.weaponEl.offsetWidth;
  P.weaponEl.classList.add('swing');

  for (const m of [...G.monsters]) {
    if (Math.hypot(m.x - cx, m.y - 20 - cy) <= ATTACK_REACH + m.T.r) hitMonster(m, st.atk);
  }
  const b = G.boss;
  if (b && Math.hypot(b.x - cx, b.y - 60 - cy) <= ATTACK_REACH + BOSS.r) hitBoss(st.atk);
}

function flash(el) {
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 110);
}

function hitMonster(m, atk) {
  if (!G.monsters.includes(m)) return;   // 같은 공격 중 이미 사라진 몬스터
  const { d, crit } = rollHit(atk, m.T.def);
  m.hp -= d;
  floatText(m.x, m.y - 60, crit ? `치명타! ${d}` : `${d}`, crit ? 'crit' : 'dmg');
  flash(m.el);
  const a = Math.atan2(m.y - P.y, m.x - P.x);
  m.kb = 0.12; m.kbx = Math.cos(a) * 380; m.kby = Math.sin(a) * 380;
  if (m.hp <= 0) killMonster(m);
  else updateBar(m.bar, m.fill, m.txt, m.hp, m.maxHp);
}

function removeMonster(m) {
  const i = G.monsters.indexOf(m);
  if (i >= 0) G.monsters.splice(i, 1);
  m.el.remove();
}

function killMonster(m) {
  removeMonster(m);
  poof(m.x, m.y);
  const exp = Math.round(m.T.exp * (1 + 0.04 * (S.level - 1)));
  floatText(m.x, m.y - 40, `+${exp} EXP`, 'exp');
  if (Math.random() < DROP_CHANCE) spawnDrop(m.x, m.y);
  gainExp(exp);
}

function hitBoss(atk) {
  const b = G.boss;
  const { d, crit } = rollHit(atk, BOSS.def);
  b.hp -= d;
  floatText(b.x, b.y - 170, crit ? `치명타! ${d}` : `${d}`, crit ? 'crit' : 'dmg');
  flash(b.el);
  if (!b.rage && b.hp <= b.maxHp / 2) {
    b.rage = true;
    b.el.classList.add('rage');
    toast(`😡 ${BOSS.name}이 분노했어요! 공격이 빨라져요`, 'big');
  }
  updateBossBars();
  if (b.hp <= 0) bossDefeated();
}

function inSafeZone(p) {
  return SAVE_POINTS.some((sp) => dist(p, sp) < SAFE_R);
}

function hurtPlayer(atk) {
  if (P.dead || G.ending || inSafeZone(P)) return;
  const d = calcDmg(atk, stats().def);
  P.hp -= d;
  P.sinceHit = 0;
  P.hurtT = 0.15;
  floatText(P.x, P.y - 70, `-${d}`, 'hurt');
  if (P.hp <= 0) die();
}

function gainExp(n) {
  S.exp += n;
  let ups = 0;
  while (S.exp >= expNeed(S.level)) {
    S.exp -= expNeed(S.level);
    S.level++;
    S.points += POINTS_PER_LEVEL;
    ups++;
    onLevel(S.level);
  }
  if (ups) {
    P.hp = stats().hp;
    floatText(P.x, P.y - 90, 'LEVEL UP!', 'lvl');
    toast(`🎉 레벨 업! Lv.${S.level} — 스탯 포인트 +${ups * POINTS_PER_LEVEL}`);
    G.pendingStat = true;
    nextModal();
  }
}

function onLevel(lv) {
  const t = MONSTERS.find((m) => m.unlock === lv && lv > 1);
  if (t) {
    toast(`⚠️ 새로운 몬스터 등장: ${t.emoji} ${t.name}`, 'warn');
    // 멀리 있는 기존 몬스터 절반을 정리해서 새 몬스터가 바로 나타나게 함
    for (const m of [...G.monsters]) if (dist(m, P) > 700 && Math.random() < 0.5) removeMonster(m);
  }
  if (lv >= BOSS_LEVEL) spawnBoss(true);
}

// ---------- 기절 & 부활 ----------
function die() {
  P.dead = true;
  P.hp = 0;
  const lost = Math.floor(S.exp * DEATH_EXP_LOSS);
  S.exp -= lost;
  const sp = SAVE_POINTS[S.savePoint];
  $('death-text').innerHTML =
    `경험치 <b class="down">-${lost}</b> 를 잃었어요. (레벨과 장비는 그대로예요)<br>` +
    `마지막 세이브 포인트 <b>⛺ ${sp.name}</b>에서 부활합니다.`;
  G.pickQueue.length = 0;
  if (G.modal) { $(G.modal).classList.add('hidden'); G.modal = null; }
  openModal('modal-death');
}

function respawn() {
  const sp = SAVE_POINTS[S.savePoint];
  P.x = sp.x; P.y = sp.y + 100;
  P.hp = stats().hp;
  P.dead = false;
  P.sinceHit = 99;
  for (const m of [...G.monsters]) if (dist(m, P) < 450) removeMonster(m);
  for (const bl of G.bullets) bl.el.remove();
  G.bullets = [];
  if (G.boss) {   // 쓰러지면 보스 체력도 회복
    G.boss.hp = G.boss.maxHp;
    G.boss.rage = false;
    G.boss.el.classList.remove('rage');
    G.boss.x = CENTER.x; G.boss.y = CENTER.y;
    updateBossBars();
  }
  closeModal();
  toast(`⛺ ${sp.name}에서 부활했어요`);
}

// ---------- 보스 처치 & 엔딩 ----------
function bossDefeated() {
  const b = G.boss;
  poof(b.x, b.y - 60, '💥');
  b.el.remove();
  G.boss = null;
  for (const bl of G.bullets) bl.el.remove();
  G.bullets = [];
  $('boss-bar').classList.add('hidden');
  S.cleared = true;
  G.ending = true;
  world.classList.add('purified');
  for (const m of [...G.monsters]) { poof(m.x, m.y, '✨'); removeMonster(m); }
  clearSave();
  toast('✨ 오염의 근원이 사라졌어요! 도시가 정화됩니다…', 'big');
  setTimeout(showEnding, 2200);
}

function showEnding() {
  G.running = false;
  const t = Math.floor(S.playTime);
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  $('ending-stats').innerHTML =
    `🐹 ${HAMSTERS[S.type].name} · Lv.${S.level}<br>` +
    `${S.weapon ? S.weapon.emoji + ' ' + S.weapon.name : '맨손'} / ${S.armor ? S.armor.emoji + ' ' + S.armor.name : '방어구 없음'}<br>` +
    `플레이 시간 ${mm}분 ${ss}초`;
  $('ending-screen').classList.remove('hidden');
}

function restart() {
  $('ending-screen').classList.add('hidden');
  $('game').classList.add('hidden');
  $('start-screen').classList.remove('hidden');
  G = null;
  buildStart();
  $('start-screen').scrollTop = 0;
}

// =========================================================
// 모달 (열려 있는 동안 게임 일시정지)
// =========================================================
function clearInput() {
  for (const k in keys) keys[k] = false;
  attackHeld = false;
  $('attack-btn').classList.remove('pressed');
  joyEnd();
}
function openModal(id) {
  G.modal = id;
  $(id).classList.remove('hidden');
  clearInput();
}
function closeModal() {
  if (!G || !G.modal) return;
  $(G.modal).classList.add('hidden');
  G.modal = null;
  if (document.activeElement) document.activeElement.blur();
  nextModal();
}
function nextModal() {
  if (!G || G.modal || !G.running || P.dead) return;
  if (G.pickQueue.length) showCompare(G.pickQueue.shift());
  else if (G.pendingStat && S.points > 0) { G.pendingStat = false; showStatModal(); }
}

// ---------- 장비 비교 ----------
function itemCard(it, title) {
  if (!it) {
    return `<div class="icard empty"><div class="icard-title">${title}</div><div class="icard-emoji">∅</div><div class="iname">장착 없음</div></div>`;
  }
  const R = RARITY[it.rarity];
  return `<div class="icard r-${R.key}">
    <div class="icard-title">${title}</div>
    <div class="icard-emoji">${it.emoji}</div>
    ${rarityBadge(it)}
    <div class="iname">${it.name}</div>
    <div class="ilvl">Lv.${it.lvl}</div>
    <ul>${itemStatList(it).map((s) => `<li>${s}</li>`).join('')}</ul>
  </div>`;
}
function showCompare({ item, source }) {
  const cur = S[item.slot];
  $('compare-title').textContent = source === 'chest' ? '🎁 상자를 열었어요!' : '💎 몬스터가 장비를 떨어뜨렸어요!';
  $('compare-slot').textContent = item.slot === 'weapon' ? '⚔️ 무기' : '🛡️ 방어구';
  $('compare-cards').innerHTML = itemCard(cur, '현재 장착') + '<div class="vs">➜</div>' + itemCard(item, '새 장비');
  const diffs = STAT_KEYS.map((k) => {
    const n = (item[k] || 0) - (cur?.[k] || 0);
    if (!n) return '';
    return n > 0 ? `<span class="up">${STAT_LABEL[k]} ▲ +${n}</span>` : `<span class="down">${STAT_LABEL[k]} ▼ ${n}</span>`;
  }).filter(Boolean);
  $('compare-diff').innerHTML = '교체하면: ' + (diffs.length ? diffs.join(' · ') : '변화 없음') +
    '<br><small>교체하면 기존 장비는 사라져요</small>';
  G.compareItem = item;
  openModal('modal-compare');
}
function equipItem(it) {
  withMaxHpChange(() => { S[it.slot] = it; });
  equipVisual(P.el);
  toast(`${it.emoji} [${RARITY[it.rarity].label}] ${it.name} 장착!`);
}

// ---------- 장비 창 ----------
function showEquip() {
  $('equip-preview').innerHTML = hamsterHTML(S.type);
  equipVisual($('equip-preview'));
  const slot = (it, label, icon) => {
    if (!it) return `<div class="eslot"><div class="ee">${icon}</div><div class="einfo"><b>${label}</b><br><span class="estats">비어 있음 — 🎁 상자나 몬스터 드랍으로 얻어요</span></div></div>`;
    return `<div class="eslot r-${RARITY[it.rarity].key}"><div class="ee">${it.emoji}</div>
      <div class="einfo">${rarityBadge(it)} <b>${it.name}</b> <small>Lv.${it.lvl}</small><br>
      <span class="estats">${itemStatList(it).join(' · ')}</span></div></div>`;
  };
  $('equip-slots').innerHTML = slot(S.weapon, '무기', '⚔️') + slot(S.armor, '방어구', '🛡️');
  const p = statParts(), t = stats();
  $('equip-stats').innerHTML =
    `<tr><th>스탯</th><th>기본</th><th>배분</th><th>장비</th><th>합계</th></tr>` +
    STAT_KEYS.map((k) => `<tr><td>${STAT_ICON[k]} ${STAT_LABEL[k]}</td><td>${p.base[k]}</td><td>+${p.alloc[k]}</td><td>+${p.equip[k]}</td><td>${t[k]}</td></tr>`).join('');
  openModal('modal-equip');
}

// ---------- 스탯 배분 창 ----------
function showStatModal() {
  G.pending = { atk: 0, def: 0, hp: 0, spd: 0 };
  renderStat();
  openModal('modal-stat');
}
function renderStat() {
  const used = STAT_KEYS.reduce((s, k) => s + G.pending[k], 0);
  const left = S.points - used;
  $('stat-points').textContent = left;
  const cur = stats();
  $('stat-rows').innerHTML = STAT_KEYS.map((k) => {
    const add = G.pending[k] * STAT_PER_POINT[k];
    return `<div class="stat-row">
      <span class="si">${STAT_ICON[k]}</span>
      <span class="sl">${STAT_LABEL[k]}<small>1점당 +${STAT_PER_POINT[k]}</small></span>
      <span class="sv">${cur[k]}${add ? ` <b class="up">→ ${cur[k] + add}</b>` : ''}</span>
      <button data-k="${k}" data-d="-1" ${G.pending[k] ? '' : 'disabled'} aria-label="${STAT_LABEL[k]} 빼기">−</button>
      <button class="plus" data-k="${k}" data-d="1" ${left > 0 ? '' : 'disabled'} aria-label="${STAT_LABEL[k]} 더하기">+</button>
    </div>`;
  }).join('');
  $('btn-stat-ok').disabled = used === 0;
}
function applyStat() {
  const used = STAT_KEYS.reduce((s, k) => s + G.pending[k], 0);
  if (!used) return;
  withMaxHpChange(() => {
    for (const k of STAT_KEYS) S.alloc[k] += G.pending[k];
    S.points -= used;
  });
  toast(`⭐ 스탯 ${used}점을 배분했어요`);
  closeModal();
}

// =========================================================
// 게임 루프
// =========================================================
function update(dt) {
  const st = stats();
  S.playTime += dt;
  P.atkCd -= dt;
  P.sinceHit += dt;
  P.hurtT -= dt;

  // --- 이동 ---
  let mx = 0, my = 0;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (joy.id !== null) { mx += joy.vx; my += joy.vy; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  P.moving = len > 0.1;
  if (P.moving) {
    P.x = clamp(P.x + mx * st.spd * dt, PLAYER_R, WORLD_W - PLAYER_R);
    P.y = clamp(P.y + my * st.spd * dt, PLAYER_R + 40, WORLD_H - PLAYER_R);
    const l = Math.hypot(mx, my);
    P.fx = mx / l; P.fy = my / l;
    if (Math.abs(mx) > 0.05) P.left = mx < 0;
  }

  // --- 공격 ---
  if (attackHeld || keys.Space) doAttack();

  // --- 세이브 포인트 / 회복 ---
  G.nearSave = SAVE_POINTS.findIndex((sp) => dist(P, sp) < SAFE_R);
  if (G.nearSave >= 0) P.hp = Math.min(st.hp, P.hp + st.hp * 0.2 * dt);
  else if (P.sinceHit > 5) P.hp = Math.min(st.hp, P.hp + st.hp * 0.015 * dt);

  updateMonsters(dt);
  updateBoss(dt);
  updateBullets(dt);
  if (P.dead) return;

  // --- 상자 열기 ---
  for (const c of [...G.chests]) {
    if (dist(c, P) < 42) {
      G.chests.splice(G.chests.indexOf(c), 1);
      c.el.remove();
      poof(c.x, c.y, '✨');
      G.chestTimers.push(CHEST_RESPAWN);
      const slot = Math.random() < 0.5 ? 'weapon' : 'armor';
      G.pickQueue.push({ item: makeItem(slot, S.level, rollRarity(CHEST_RARITY)), source: 'chest' });
    }
  }
  // --- 떨어진 장비 줍기 ---
  for (const d of [...G.drops]) {
    if (dist(d, P) < 36) {
      G.drops.splice(G.drops.indexOf(d), 1);
      d.el.remove();
      G.pickQueue.push({ item: d.item, source: 'drop' });
    }
  }
  if (G.pickQueue.length) nextModal();

  // --- 리스폰 타이머 ---
  for (let i = G.chestTimers.length - 1; i >= 0; i--) {
    G.chestTimers[i] -= dt;
    if (G.chestTimers[i] <= 0) { G.chestTimers.splice(i, 1); spawnChest(); }
  }
  G.spawnT -= dt;
  if (G.spawnT <= 0 && !G.ending) {
    G.spawnT = 1.0;
    if (G.monsters.length < MAX_MONSTERS) spawnMonster(false);
  }
}

function updateMonsters(dt) {
  const playerSafe = inSafeZone(P);
  for (const m of G.monsters) {
    const T = m.T;
    const dx = P.x - m.x, dy = P.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    m.atkCd -= dt;
    let vx = 0, vy = 0;
    const touching = d < T.r + PLAYER_R + 4;

    if (m.kb > 0) {
      m.kb -= dt;
      vx = m.kbx; vy = m.kby;
    } else if (d < T.aggro && !P.dead) {
      if (!touching) { vx = (dx / d) * T.spd; vy = (dy / d) * T.spd; }
      m.left = dx < 0;
    } else {
      m.wt -= dt;
      if (m.wt <= 0) {
        m.wt = rand(2, 4);
        const a = rand(0, Math.PI * 2);
        const go = Math.random() < 0.65 ? T.spd * 0.4 : 0;
        m.wvx = Math.cos(a) * go; m.wvy = Math.sin(a) * go;
      }
      vx = m.wvx; vy = m.wvy;
      if (vx) m.left = vx < 0;
    }
    m.x += vx * dt;
    m.y += vy * dt;

    // 세이브 포인트 안전지대에는 들어오지 못함
    for (const sp of SAVE_POINTS) {
      const sx = m.x - sp.x, sy = m.y - sp.y;
      const sd = Math.hypot(sx, sy);
      const minD = SAFE_R + T.r;
      if (sd < minD && sd > 0) { m.x = sp.x + (sx / sd) * minD; m.y = sp.y + (sy / sd) * minD; }
    }
    m.x = clamp(m.x, 40, WORLD_W - 40);
    m.y = clamp(m.y, 60, WORLD_H - 40);

    if (touching && m.atkCd <= 0 && !playerSafe && !P.dead) {
      m.atkCd = 1.0;
      hurtPlayer(T.atk);
      if (P.dead) return;
    }
  }
  // 몬스터끼리 겹치지 않게 살짝 밀어내기
  const ms = G.monsters;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.T.r + b.T.r;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
}

function updateBoss(dt) {
  const b = G.boss;
  if (!b || P.dead) return;
  const dx = P.x - b.x, dy = P.y - b.y;
  const d = Math.hypot(dx, dy) || 1;
  b.atkCd -= dt;
  b.shotT -= dt;
  const spd = BOSS.spd * (b.rage ? 1.35 : 1);
  const playerSafe = inSafeZone(P);

  if (d < 750 && !playerSafe) {
    if (d > BOSS.r + PLAYER_R) { b.x += (dx / d) * spd * dt; b.y += (dy / d) * spd * dt; }
  } else if (dist(b, CENTER) > 30) {
    const cd = dist(b, CENTER);
    b.x += ((CENTER.x - b.x) / cd) * spd * dt;
    b.y += ((CENTER.y - b.y) / cd) * spd * dt;
  }
  // 안전지대에는 들어오지 못함
  for (const sp of SAVE_POINTS) {
    const sd = dist(b, sp), minD = SAFE_R + BOSS.r;
    if (sd < minD && sd > 0) { b.x = sp.x + ((b.x - sp.x) / sd) * minD; b.y = sp.y + ((b.y - sp.y) / sd) * minD; }
  }

  if (d < BOSS.r + PLAYER_R + 6 && b.atkCd <= 0) {
    b.atkCd = 1.0;
    hurtPlayer(BOSS.atk);
  }
  // 오염 탄환 원형 발사
  if (b.shotT <= 0 && d < 800) {
    b.shotT = b.rage ? 1.8 : 2.8;
    const n = b.rage ? 14 : 10;
    const off = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const el = addEnt('bullet', '<div class="orb"></div>');
      G.bullets.push({ x: b.x, y: b.y - 50, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 3.2, el });
    }
  }
}

function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const bl = G.bullets[i];
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    bl.life -= dt;
    let gone = bl.life <= 0 || inSafeZone(bl);
    if (!gone && !P.dead && Math.hypot(bl.x - P.x, bl.y - (P.y - 20)) < 13 + PLAYER_R) {
      gone = true;
      hurtPlayer(BOSS.bulletAtk);
    }
    if (gone) { bl.el.remove(); G.bullets.splice(i, 1); }
  }
}

// ---------- 그리기 ----------
function render() {
  camX = WORLD_W <= VW ? (WORLD_W - VW) / 2 : clamp(P.x - VW / 2, 0, WORLD_W - VW);
  camY = WORLD_H <= VH ? (WORLD_H - VH) / 2 : clamp(P.y - VH / 2, 0, WORLD_H - VH);
  world.style.transform = `translate3d(${-camX}px, ${-camY}px, 0)`;

  place(P.el, P.x, P.y);
  P.el.classList.toggle('left', P.left);
  P.el.classList.toggle('moving', P.moving);
  P.el.classList.toggle('hurt', P.hurtT > 0);
  P.el.classList.toggle('safe', G.nearSave >= 0);
  const st = stats();
  updateBar(P.bar, P.fill, null, P.hp, st.hp);

  for (const m of G.monsters) {
    place(m.el, m.x, m.y);
    if (m._left !== m.left) { m._left = m.left; m.el.classList.toggle('flip', !m.left); }
  }
  for (const bl of G.bullets) place(bl.el, bl.x, bl.y);

  const arrow = $('boss-arrow');
  if (G.boss) {
    place(G.boss.el, G.boss.x, G.boss.y);
    const sx = G.boss.x - camX, sy = G.boss.y - 60 - camY;
    const off = sx < 0 || sy < 0 || sx > VW || sy > VH;
    arrow.classList.toggle('hidden', !off);
    if (off) {
      const ax = clamp(sx, 40, VW - 40), ay = clamp(sy, 150, VH - 60);
      const ang = Math.atan2(sy - VH / 2, sx - VW / 2);
      arrow.style.transform = `translate(${ax - 30}px, ${ay - 25}px)`;
      arrow.querySelector('.arrow').style.transform = `rotate(${ang}rad)`;
    }
  } else {
    arrow.classList.add('hidden');
  }

  if (G.frame++ % 6 === 0) drawMinimap();
  updateHUD();
}

function drawMinimap() {
  const c = $('minimap');
  const ctx = c.getContext('2d');
  const s = c.width / WORLD_W;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = S.cleared ? 'rgba(80,150,70,.6)' : 'rgba(70,60,90,.6)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  for (const r of ROADS) { ctx.fillRect(0, (r - 60) * s, c.width, 120 * s); ctx.fillRect((r - 60) * s, 0, 120 * s, c.height); }
  SAVE_POINTS.forEach((sp, i) => {
    ctx.fillStyle = i === S.savePoint ? '#ff9d3b' : '#7fd8ff';
    ctx.fillRect(sp.x * s - 4, sp.y * s - 4, 8, 8);
  });
  ctx.fillStyle = '#ffd84d';
  for (const ch of G.chests) ctx.fillRect(ch.x * s - 1.5, ch.y * s - 1.5, 3, 3);
  ctx.fillStyle = '#ff5d6c';
  for (const m of G.monsters) ctx.fillRect(m.x * s - 1, m.y * s - 1, 2, 2);
  if (G.boss) {
    ctx.fillStyle = '#c070ff';
    ctx.beginPath(); ctx.arc(G.boss.x * s, G.boss.y * s, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.strokeRect(camX * s, camY * s, VW * s, VH * s);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(P.x * s, P.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G && G.running) {
    if (!G.modal) update(dt);
    render();
  }
  requestAnimationFrame(loop);
}

// =========================================================
// 입력
// =========================================================
const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

function onKeyDown(e) {
  if (!G || !G.running) return;
  if (G.modal) {
    if (e.code === 'Escape' && G.modal !== 'modal-death') closeModal();
    if (e.code === 'KeyI' && G.modal === 'modal-equip') closeModal();
    if (e.code === 'KeyK' && G.modal === 'modal-stat') closeModal();
    return;
  }
  // e.code 사용: 한글 입력 상태에서도 WASD가 동작
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyI') showEquip();
  if (e.code === 'KeyK') showStatModal();
}
function onKeyUp(e) {
  keys[e.code] = false;
  if (G && !G.modal && e.code === 'Space') e.preventDefault();
}

// ---------- 가상 조이스틱 ----------
const JOY_R = 55;
function joyStart(e) {
  if (!G || G.modal) return;
  e.preventDefault();
  joy.id = e.pointerId;
  joy.ox = e.clientX;
  joy.oy = e.clientY;
  const base = $('joy-base');
  base.style.left = e.clientX + 'px';
  base.style.top = e.clientY + 'px';
  base.classList.add('active');
  $('joy-zone').setPointerCapture(e.pointerId);
}
function joyMove(e) {
  if (joy.id !== e.pointerId) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
  joy.vx = dx / JOY_R;
  joy.vy = dy / JOY_R;
  $('joy-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}
function joyEnd(e) {
  if (e && joy.id !== e.pointerId) return;
  joy.id = null;
  joy.vx = joy.vy = 0;
  const base = $('joy-base');
  base.style.left = '';
  base.style.top = '';
  base.classList.remove('active');
  $('joy-knob').style.transform = '';
}

function onResize() {
  VW = viewport.clientWidth;
  VH = viewport.clientHeight;
}

// =========================================================
// 초기화
// =========================================================
function init() {
  world = $('world');
  viewport = $('viewport');

  const markTouch = () => document.body.classList.add('touch');
  if (matchMedia('(pointer: coarse)').matches) markTouch();
  addEventListener('touchstart', markTouch, { once: true, passive: true });

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  addEventListener('resize', onResize);
  document.addEventListener('contextmenu', (e) => { if (G) e.preventDefault(); });

  // 시작 화면
  $('btn-new').onclick = () => selectedType && newGame(selectedType);
  $('btn-continue').onclick = continueGame;
  $('btn-restart').onclick = restart;

  // HUD 버튼
  $('btn-equip').onclick = (e) => { e.currentTarget.blur(); if (!G.modal) showEquip(); };
  $('btn-stat').onclick = (e) => { e.currentTarget.blur(); if (!G.modal) showStatModal(); };
  $('btn-save').onclick = (e) => { e.currentTarget.blur(); if (!G.modal) saveGame(); };

  // 모달 버튼
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  $('btn-swap').onclick = () => { equipItem(G.compareItem); closeModal(); };
  $('btn-discard').onclick = () => { toast('🗑️ 장비를 버렸어요'); closeModal(); };
  $('btn-respawn').onclick = respawn;
  $('btn-stat-ok').onclick = applyStat;
  $('stat-rows').onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    G.pending[btn.dataset.k] += Number(btn.dataset.d);
    renderStat();
  };

  // 모바일 조작
  const zone = $('joy-zone');
  zone.addEventListener('pointerdown', joyStart);
  zone.addEventListener('pointermove', joyMove);
  zone.addEventListener('pointerup', joyEnd);
  zone.addEventListener('pointercancel', joyEnd);
  const atk = $('attack-btn');
  atk.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!G || G.modal) return;
    attackHeld = true;
    atk.classList.add('pressed');
    atk.setPointerCapture(e.pointerId);
  });
  const atkUp = () => { attackHeld = false; atk.classList.remove('pressed'); };
  atk.addEventListener('pointerup', atkUp);
  atk.addEventListener('pointercancel', atkUp);

  // 테스트 모드 (주소 끝에 ?test)
  $('test-panel').onclick = (e) => {
    const t = e.target.dataset.test;
    if (!t || !G || G.modal) return;
    e.target.blur();
    if (t === 'lv1') gainExp(expNeed(S.level) - S.exp);
    if (t === 'lv5') for (let i = 0; i < 5; i++) gainExp(expNeed(S.level) - S.exp);
    if (t === 'heal') P.hp = stats().hp;
    if (t === 'item') {
      G.pickQueue.push({ item: makeItem(Math.random() < 0.5 ? 'weapon' : 'armor', S.level, rollRarity(CHEST_RARITY)), source: 'chest' });
      nextModal();
    }
    if (t === 'boss') {
      if (G.boss) { P.x = G.boss.x; P.y = G.boss.y + 330; }
      else toast(`보스는 Lv.${BOSS_LEVEL}에 등장해요`, 'warn');
    }
  };

  buildStart();
  requestAnimationFrame(loop);
}

init();
