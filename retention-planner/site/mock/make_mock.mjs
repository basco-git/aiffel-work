// 견본 데이터 생성기: docs/DATA_CONTRACT.md 형식 그대로 site/mock/data/에 JSON을 쓴다.
// site/data/에는 ML 실제 결과(run_all.ps1이 복사)가 있으므로 절대 덮어쓰지 않는다.
// 실행: node site/mock/make_mock.mjs
// 견본으로 화면을 보려면 site/mock/data/를 임시 폴더의 data/로 복사해 확인한다.
// 견본으로 계산 검사: node site/alloc.test.mjs site/mock/data
// 주의: 여기 숫자는 화면 개발용 견본이며 어떤 분석 결과도 아니다. meta.json의 "mock": true.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage1TopK, stage1Threshold, stage2All, stage2Allocate, fairnessTable, countFromRatio } from '../alloc.js';

const SEED = 42;
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'data');

// ---------- 시드 고정 의사난수 (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(SEED);
const normal = () => {
  const u = 1 - R();
  const v = R();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const r6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const perm = (n) => shuffle(Array.from({ length: n }, (_, i) => i));
const pick = (items, weights) => {
  const u = R() * weights.reduce((a, b) => a + b, 0);
  let s = 0;
  for (let i = 0; i < items.length; i++) { s += weights[i]; if (u < s) return items[i]; }
  return items[items.length - 1];
};

/** 점수 내림차순 순위(0 = 가장 위험), 동점은 tiebreak */
function rankFrom(score, tb) {
  const idx = Array.from({ length: score.length }, (_, i) => i)
    .sort((a, b) => (score[b] - score[a]) || (tb[a] - tb[b]));
  const rank = new Array(score.length);
  idx.forEach((i, r) => { rank[i] = r; });
  return rank;
}

function auc(score, y) {
  const idx = Array.from({ length: y.length }, (_, i) => i).sort((a, b) => score[a] - score[b]);
  // 평균 순위(동점 처리)로 Mann-Whitney U
  const ranks = new Array(y.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && score[idx[j + 1]] === score[idx[i]]) j++;
    for (let t = i; t <= j; t++) ranks[idx[t]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  let pos = 0, sumR = 0;
  y.forEach((v, i) => { if (v === 1) { pos++; sumR += ranks[i]; } });
  const neg = y.length - pos;
  return (sumR - (pos * (pos + 1)) / 2) / (pos * neg);
}

function spearman(a, b) {
  const tb = perm(a.length);
  const ra = rankFrom(a, tb), rb = rankFrom(b, tb);
  const n = a.length;
  const ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - ma);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - ma) ** 2;
  }
  return num / Math.sqrt(da * db);
}

// ---------- 직원 특성 (1단계 대조군 1,080명 + 2단계 전체 2,700명)
function makePeople(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const engage = normal();
    const sat = () => Math.min(5, Math.max(1, Math.round(3.2 + 0.5 * engage + normal() * 0.9)));
    const p = {
      sat_pay: sat(), sat_job_fit: sat(), sat_benefits: sat(), sat_direction: sat(),
      leader_conflict: R() < 0.15 ? 1 : 0,
      overtime: normal(),
      tenure: -Math.log(1 - R()) * 6,
      age_band: pick(['30세 미만', '30대', '40대', '50세 이상'], [0.24, 0.34, 0.27, 0.15]),
      gender: pick(['남', '여'], [0.56, 0.44]),
    };
    const low = (s) => (5 - s) / 4;
    const ageEff = { '30세 미만': 0.3, '30대': 0.1, '40대': -0.1, '50세 이상': -0.3 }[p.age_band];
    p.logit0 = -4.0 + 0.9 * p.leader_conflict + 1.1 * low(p.sat_pay) + 1.1 * low(p.sat_job_fit)
      + 0.9 * low(p.sat_direction) + 0.5 * low(p.sat_benefits) + 0.45 * p.overtime
      + (p.tenure < 1 ? 0.4 : 0) + ageEff + normal() * 1.0;
    p.p_none = sigmoid(p.logit0);
    p.low = { pay: low(p.sat_pay), fit: low(p.sat_job_fit), ben: low(p.sat_benefits), dir: low(p.sat_direction) };
    rows.push(p);
  }
  return rows;
}

// ---------- 1단계
const N1 = 1080;
const people1 = makePeople(N1);
const left1 = people1.map((p) => (R() < p.p_none ? 1 : 0));
const tb1 = perm(N1);
// 모델 확률: 진짜 로짓 + 모델마다 다른 잡음
const probOf = (noise) => people1.map((p) => r6(sigmoid(p.logit0 * 0.9 + normal() * noise)));
const probLogit = probOf(0.75);
const probRf = probOf(0.6);
const probHgb = probOf(0.5);
const probGb = probOf(0.55);
const tenureScore = people1.map((p) => -p.tenure + normal() * 3); // 근속 짧을수록 위험
const methods1 = [
  { id: 'random', label: '무작위', kind: 'baseline', rank: perm(N1), prob: null },
  { id: 'tenure', label: '근속 짧은 순', kind: 'baseline', rank: rankFrom(tenureScore, tb1), prob: null },
  { id: 'logit', label: '로지스틱 회귀', kind: 'baseline', rank: rankFrom(probLogit, tb1), prob: probLogit },
  { id: 'rf', label: '랜덤 포레스트', kind: 'model', rank: rankFrom(probRf, tb1), prob: probRf },
  { id: 'hgb', label: 'HistGradientBoosting', kind: 'model', rank: rankFrom(probHgb, tb1), prob: probHgb },
  { id: 'gb', label: '그래디언트 부스팅', kind: 'model', rank: rankFrom(probGb, tb1), prob: probGb },
];
const stage1 = { n: N1, left: left1, best: 'hgb', methods: methods1 };

// ---------- 2단계 (같은 직원·같은 추첨, 시나리오마다 효과 규칙만 다름)
const N2 = 2700;
const people2 = makePeople(N2);
const talkBy = shuffle([...Array(1080).fill('none'), ...Array(810).fill('lead'), ...Array(810).fill('exec')]);
const uLeave = people2.map(() => R());
const uDecided = people2.map(() => R());
const tb2 = perm(N2);
const risk2 = people2.map((p) => r6(sigmoid(p.logit0 * 0.9 + normal() * 0.5)));
const noiseL = people2.map(() => normal());
const noiseE = people2.map(() => normal());

function deltas(scn) {
  if (scn === 'A') return people2.map(() => ({ lead: 0.4, exec: 0.8, decided: 0 }));
  const raw = people2.map((p, i) => {
    const decided = uDecided[i] < 0.5 * p.p_none ? 1 : 0;
    const l = Math.max(-0.4, 0.3 + 0.3 * p.low.fit + 0.1 * p.low.dir - 0.8 * p.leader_conflict);
    const e = 0.2 + 0.6 * p.low.pay + 0.5 * p.low.fit + 0.2 * p.low.ben + 0.7 * p.leader_conflict + 0.6 * p.low.dir;
    return { lead: decided ? 0 : l, exec: decided ? 0 : e, decided };
  });
  const mL = raw.reduce((s, d) => s + d.lead, 0) / N2;
  const mE = raw.reduce((s, d) => s + d.exec, 0) / N2;
  return raw.map((d) => ({ lead: (d.lead * 0.4) / mL, exec: (d.exec * 0.8) / mE, decided: d.decided }));
}

function makeStage2(scn) {
  const ds = deltas(scn);
  const tauL = [], tauE = [], left = [];
  people2.forEach((p, i) => {
    const pl = sigmoid(p.logit0 - ds[i].lead);
    const pe = sigmoid(p.logit0 - ds[i].exec);
    tauL.push(p.p_none - pl);
    tauE.push(p.p_none - pe);
    const pr = talkBy[i] === 'none' ? p.p_none : talkBy[i] === 'lead' ? pl : pe;
    left.push(uLeave[i] < pr ? 1 : 0);
  });
  // T-learner 추정 흉내: 진짜 효과 + 잡음(시나리오 A는 상대적으로 잡음이 커서 순위가 흐림)
  const sdL = scn === 'A' ? 0.02 : 0.025;
  const sdE = scn === 'A' ? 0.03 : 0.035;
  return {
    n: N2,
    talk_by: talkBy,
    left,
    risk: risk2,
    tau_hat_lead: tauL.map((t, i) => r6(t + noiseL[i] * sdL)),
    tau_hat_exec: tauE.map((t, i) => r6(t + noiseE[i] * sdE)),
    tau_lead: tauL.map(r6),
    tau_exec: tauE.map(r6),
    tiebreak: tb2,
    leader_conflict: people2.map((p) => p.leader_conflict),
    // 권한 필요: 팀장 갈등 또는 연봉·업무·방향 만족 중 하나라도 2 이하
    needs_authority: people2.map((p) => (p.leader_conflict === 1 || p.sat_pay <= 2 || p.sat_job_fit <= 2 || p.sat_direction <= 2 ? 1 : 0)),
    age_band: people2.map((p) => p.age_band),
    gender: people2.map((p) => p.gender),
    _decidedRate: ds.reduce((s, d) => s + d.decided, 0) / N2,
  };
}

// ---------- 지표
function stage1Metrics() {
  const n = N1;
  const leaveRate = left1.reduce((a, b) => a + b, 0) / n;
  const ex = { k: 0, r: 0, C_replace: 0, C_lead: 0 };
  const methods = methods1.map((m) => {
    const capture = {}, lift = {};
    for (const pct of [5, 10, 20, 30]) {
      const res = stage1TopK(left1, m.rank, { ...ex, k: pct / 100 });
      capture[pct] = r6(res.capture);
      lift[pct] = r6(res.TP / res.S / leaveRate);
    }
    const score = m.rank.map((r) => -r);
    let accuracy = null, brierRaw = null, brierCal = null;
    if (m.prob) {
      accuracy = m.prob.reduce((s, p, i) => s + ((p >= 0.5 ? 1 : 0) === left1[i] ? 1 : 0), 0) / n;
      brierCal = m.prob.reduce((s, p, i) => s + (p - left1[i]) ** 2, 0) / n;
      brierRaw = brierCal * (1.06 + R() * 0.06);
    }
    const a = auc(score, left1);
    return {
      id: m.id, label: m.label,
      accuracy: r6(accuracy), auc: r6(a), brier_raw: r6(brierRaw), brier_cal: r6(brierCal),
      capture, lift, cv_auc: m.kind === 'baseline' && !m.prob ? null : r6(a - 0.01 + normal() * 0.006),
    };
  });
  return { n_test: n, leave_rate: r6(leaveRate), all_stay_accuracy: r6(1 - leaveRate), methods };
}

/** 관측 기반 Qini 곡선: 점수 높은 순으로 x 비율까지, 막은 퇴사 = Yc·Nt/Nc − Yt */
function qiniCurve(s2, arm, score) {
  const idx = [];
  for (let i = 0; i < N2; i++) if (s2.talk_by[i] === arm || s2.talk_by[i] === 'none') idx.push(i);
  idx.sort((a, b) => (score[b] - score[a]) || (s2.tiebreak[a] - s2.tiebreak[b]));
  const pts = [];
  for (let q = 0; q <= 20; q++) {
    const x = q / 20;
    const cut = Math.round(idx.length * x);
    let nt = 0, nc = 0, yt = 0, yc = 0;
    for (let j = 0; j < cut; j++) {
      const i = idx[j];
      if (s2.talk_by[i] === 'none') { nc++; yc += s2.left[i]; } else { nt++; yt += s2.left[i]; }
    }
    const y = nc > 0 ? (yc * nt) / nc - yt : 0;
    pts.push([r6(x), r6(y)]);
  }
  return pts;
}
function qiniCoef(curve) {
  const end = curve[curve.length - 1][1];
  let area = 0;
  for (let j = 1; j < curve.length; j++) {
    const [x0, y0] = curve[j - 1], [x1, y1] = curve[j];
    area += ((y0 - end * x0) + (y1 - end * x1)) / 2 * (x1 - x0);
  }
  return area / 810; // 면담군 인원으로 나눈 값(견본용 정규화)
}

function stage2Metrics(s2) {
  const scoresFor = {
    random: { lead: s2.tiebreak.map((t) => -t), exec: s2.tiebreak.map((t) => -t) },
    risk: { lead: s2.risk, exec: s2.risk },
    uplift: { lead: s2.tau_hat_lead, exec: s2.tau_hat_exec },
    oracle: { lead: s2.tau_lead, exec: s2.tau_exec },
  };
  const labels = { random: '무작위', risk: '위험 순', uplift: '효과 순(T-learner)', oracle: '진짜 효과 순(상한)' };
  const curves = {};
  const methods = Object.keys(scoresFor).map((id) => {
    const cl = qiniCurve(s2, 'lead', scoresFor[id].lead);
    const ce = qiniCurve(s2, 'exec', scoresFor[id].exec);
    curves[id] = { lead: cl, exec: ce };
    return {
      id, label: labels[id],
      qini_lead: id === 'random' ? 0 : r6(qiniCoef(cl)),
      qini_exec: id === 'random' ? 0 : r6(qiniCoef(ce)),
      corr_lead: id === 'random' ? null : r6(spearman(scoresFor[id].lead, s2.tau_lead)),
      corr_exec: id === 'random' ? null : r6(spearman(scoresFor[id].exec, s2.tau_exec)),
    };
  });
  methods.push({ id: 'expert', label: 'HR 전문가 규칙', qini_lead: null, qini_exec: null, corr_lead: null, corr_exec: null });
  return { n_test: N2, arms: { none: 1080, lead: 810, exec: 810 }, methods, qini_curves: curves };
}

function calibration() {
  const bins = (probs) => {
    const out = [];
    for (let b = 0; b < 10; b++) {
      let c = 0, sp = 0, sy = 0;
      probs.forEach((p, i) => {
        const bin = Math.min(9, Math.floor(p * 10));
        if (bin === b) { c++; sp += p; sy += left1[i]; }
      });
      if (c > 0) out.push({ mean_pred: r6(sp / c), frac_pos: r6(sy / c), count: c });
    }
    return out;
  };
  // 보정 전 확률은 과신하도록 일부러 비틀어 만든 견본
  const raw = probHgb.map((p) => Math.min(0.999, Math.max(0.001, sigmoid((Math.log(p / (1 - p)) + 0.3) * 1.35))));
  return { model: 'hgb', raw: bins(raw), cal: bins(probHgb) };
}

function importance(scn) {
  const risk = [
    ['leader_conflict', '팀장 등 갈등', 0.052], ['sat_job_fit', '원하는 업무 만족', 0.046], ['sat_pay', '연봉 만족', 0.043],
    ['sat_direction', '회사 방향성 신뢰', 0.031], ['overtime_hours_month', '월 야근 시간', 0.024],
    ['sat_benefits', '복지·보상 만족', 0.012], ['tenure_years', '근속 연수', 0.009], ['years_since_promotion', '승진 후 기간', 0.006],
  ];
  const upA = [
    ['overtime_hours_month', '월 야근 시간', 0.006], ['sat_pay', '연봉 만족', 0.005], ['leader_conflict', '팀장 등 갈등', 0.005],
    ['sat_job_fit', '원하는 업무 만족', 0.004], ['commute_minutes', '통근 시간', 0.003], ['tenure_years', '근속 연수', 0.002],
  ];
  const upB = [
    ['leader_conflict', '팀장 등 갈등', 0.031], ['sat_pay', '연봉 만족', 0.027], ['sat_direction', '회사 방향성 신뢰', 0.024],
    ['sat_job_fit', '원하는 업무 만족', 0.021], ['sat_benefits', '복지·보상 만족', 0.008], ['overtime_hours_month', '월 야근 시간', 0.005],
  ];
  const fmt = (arr) => arr.map(([feature, label, mean]) => ({ feature, label, mean: r6(mean * (0.9 + R() * 0.2)), std: r6(mean * (0.15 + R() * 0.15)) }))
    .sort((a, b) => b.mean - a.mean);
  return { risk: fmt(risk), uplift_exec: fmt(scn === 'A' ? upA : upB) };
}

// 예시 입력(PRD §7)
const EXAMPLE = { k: 0.2, m: Math.round(N2 * 0.05), r: 0.3, C_replace: 30000000, C_lead: 300000, C_exec: 1500000 };

function fairness(s2) {
  const risk = stage2Allocate(s2, 'risk', EXAMPLE);
  const up = stage2Allocate(s2, 'uplift', EXAMPLE);
  const ex = stage2Allocate(s2, 'expert', EXAMPLE);
  const rows = fairnessTable(s2, { risk: risk.assign, expert: ex.assign, uplift: up.assign }).map((g) => ({
    group: g.group, type: g.type, share: r6(g.share),
    risk: { exec_rate: r6(g.risk.exec_rate), lead_rate: r6(g.risk.lead_rate), capture: r6(g.risk.capture) },
    expert: { exec_rate: r6(g.expert.exec_rate), lead_rate: r6(g.expert.lead_rate) },
    uplift: { exec_rate: r6(g.uplift.exec_rate), lead_rate: r6(g.uplift.lead_rate) },
  }));
  const { r, ...inputs } = EXAMPLE;
  return { inputs, groups: rows };
}

// 민감도 견본: 2026-11-16 21:30 형식(시범 인원 n × 궁합 강도, 시드 3개 반복)
function sensitivity() {
  const ns = [9000, 30000, 90000, 300000], strength = [0, 0.5, 1.0], seeds = [42, 43, 44];
  const stat = (arr) => ({ mean: r6(arr.reduce((x, y) => x + y, 0) / arr.length), min: r6(Math.min(...arr)), max: r6(Math.max(...arr)) });
  const cells = [];
  for (const n of ns) for (const st of strength) {
    const nTest = Math.round(n * 0.3);
    const m = Math.round(nTest * 0.05);
    const scale = nTest / 2700;
    const lg = Math.log10(n / 9000); // 0 ~ 1.5
    const risk = [], expert = [], uplift = [], oracle = [], br = [], er = [], ce = [], cl = [];
    let wins = 0;
    for (const _ of seeds) {
      const nr = 1.3e9 * scale * (1 - 0.05 * st) * (1 + normal() * 0.04);
      const ratio = 0.8 + 0.12 * lg + st * (0.05 + 0.3 * lg) + normal() * 0.04;
      const eratio = 0.96 + st * 0.35 + normal() * 0.03;
      risk.push(nr); uplift.push(nr * ratio); expert.push(nr * eratio); oracle.push(nr * (1.25 + st * 0.8));
      br.push(ratio); er.push(eratio);
      if (ratio > 1) wins++;
      ce.push(Math.min(0.95, 0.2 + 0.25 * lg + st * 0.15 + normal() * 0.03));
      cl.push(Math.min(0.95, 0.1 + 0.2 * lg + st * 0.1 + normal() * 0.03));
    }
    cells.push({
      n, strength: st, n_test: nTest, m, seeds,
      net_risk: stat(risk), net_expert: stat(expert), net_uplift: stat(uplift), net_oracle: stat(oracle),
      benefit_ratio: stat(br), expert_ratio: stat(er), uplift_wins: wins,
      corr_exec: stat(ce), corr_lead: stat(cl),
    });
  }
  return {
    n: ns, strength, repeats: seeds.length,
    inputs: { k: 0.2, m_rule: '시험 인원의 5%', C_replace: 30000000, C_lead: 300000, C_exec: 1500000 },
    fixed: { risk_model: 'logit(보정)', uplift: 'T-learner(HistGB)', sigma: 1.0, scenario_base: 'B' },
    note: '견본 데이터. 실제 민감도 결과가 아님', runtime_sec: null, cells,
  };
}

// ---------- 쓰기
const write = (rel, obj) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj), 'utf8');
};

const s1m = stage1Metrics();
const refCases = [];
const decidedRates = {};
for (const scn of ['A', 'B']) {
  const s2 = makeStage2(scn);
  decidedRates[scn] = s2._decidedRate;
  delete s2._decidedRate;
  write(`${scn}/scores.json`, { scenario: scn, stage1, stage2: s2 });
  write(`${scn}/metrics.json`, { scenario: scn, stage1: s1m, stage2: stage2Metrics(s2) });
  write(`${scn}/calibration.json`, calibration());
  write(`${scn}/importance.json`, importance(scn));
  write(`${scn}/fairness.json`, fairness(s2));

  // 검증용 기대값(견본은 alloc.js로 만든 순환 값. 실제 값은 Python ml/allocate.py가 만든다)
  for (const inp of [EXAMPLE, { ...EXAMPLE, k: 0.1, m: 60 }, { ...EXAMPLE, k: 0.35, m: 300, C_exec: 2000000 }]) {
    const st1 = {};
    for (const m of methods1) {
      const res = stage1TopK(left1, m.rank, inp);
      st1[m.id] = { S: res.S, TP: res.TP, unneeded: res.unneeded, net: r6(res.net), capture: r6(res.capture) };
      const thr = stage1Threshold(left1, m.prob, inp);
      if (thr) st1[m.id].threshold = { S: thr.S, TP: thr.TP, net: r6(thr.net) };
    }
    const all = stage2All(s2, inp);
    const st2 = {};
    for (const [id, v] of Object.entries(all)) {
      st2[id] = { exec: v.exec, lead: v.lead, saved: r6(v.saved), net: r6(v.net), backfire: v.backfire };
    }
    refCases.push({ scenario: scn, inputs: inp, stage1: st1, stage2: st2 });
  }
}
write('reference.json', { cases: refCases });
write('sensitivity.json', sensitivity());

const leaveRateBy = (scn, arm) => {
  const s2 = makeStage2(scn);
  let c = 0, y = 0;
  s2.talk_by.forEach((t, i) => { if (t === arm) { c++; y += s2.left[i]; } });
  return r6(y / c);
};
write('meta.json', {
  mock: true,
  seed: SEED,
  n: 9000,
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  runtime_sec: null,
  versions: { node: process.versions.node, generator: 'site/mock/make_mock.mjs' },
  split: { train: 6300, test: 2700 },
  assignment: { none: 0.4, lead: 0.3, exec: 0.3 },
  scenarios: {
    A: { leave_rate: { none: leaveRateBy('A', 'none'), lead: leaveRateBy('A', 'lead'), exec: leaveRateBy('A', 'exec') }, decided_rate: r6(decidedRates.A) },
    B: { leave_rate: { none: leaveRateBy('B', 'none'), lead: leaveRateBy('B', 'lead'), exec: leaveRateBy('B', 'exec') }, decided_rate: r6(decidedRates.B) },
  },
  generation: { sigma: 1.0, b0: null, coefficients: {}, effect: { A: {}, B: {} }, note: '견본 데이터. 실제 생성 규칙 값이 아님' },
});

console.log(`견본 데이터 생성 완료: ${OUT}`);
console.log(`  1단계 n=${N1}, 퇴사 ${left1.reduce((a, b) => a + b, 0)}명 / 2단계 n=${N2}, 기준 입력 m=${EXAMPLE.m}, L=${countFromRatio(N2, EXAMPLE.k)}`);
