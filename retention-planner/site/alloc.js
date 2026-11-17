// 면담 배분 계산 (DOM 없는 순수 함수, 브라우저와 Node 둘 다에서 import)
// 기준 문서: docs/DATA_CONTRACT.md "웹 계산 규칙". Python(ml/allocate.py)과 같은 규칙으로 구현한다.

/** Python round()와 같은 반올림(정확히 .5이면 짝수 쪽). */
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** 비율 k(0~1)로 인원 수 계산: round(n × k) */
export function countFromRatio(n, k) {
  return roundHalfEven(n * k);
}

/** 비율(%)로 받은 인원을 소수점 버림으로 센다. 부동소수 오차(134.99999…)로 1명 덜 세지 않도록 작은 값을 더한다. */
export function floorCount(n, pct) {
  return Math.floor((n * pct) / 100 + 1e-9);
}

// ---------------------------------------------------------------- 1단계

/**
 * 상위 k% 면담 (rank < S 인 행 선정)
 * @param {number[]} left 0/1
 * @param {number[]} rank 0 = 가장 위험
 * @param {{k:number,r:number,C_replace:number,C_lead:number}} p
 */
export function stage1TopK(left, rank, p) {
  const n = left.length;
  const S = countFromRatio(n, p.k);
  let TP = 0;
  let leavers = 0;
  for (let i = 0; i < n; i++) {
    if (left[i] === 1) {
      leavers++;
      if (rank[i] < S) TP++;
    }
  }
  return summarize1(S, TP, leavers, p);
}

/** 기대이익 문턱: prob × r × C_replace > C_lead 인 행 선정. prob가 없으면 null */
export function stage1Threshold(left, prob, p) {
  if (!prob) return null;
  const n = left.length;
  let S = 0;
  let TP = 0;
  let leavers = 0;
  for (let i = 0; i < n; i++) {
    const pick = prob[i] * p.r * p.C_replace > p.C_lead;
    if (left[i] === 1) leavers++;
    if (pick) {
      S++;
      if (left[i] === 1) TP++;
    }
  }
  return summarize1(S, TP, leavers, p);
}

function summarize1(S, TP, leavers, p) {
  return {
    S,
    TP,
    unneeded: S - TP,
    net: TP * p.r * p.C_replace - S * p.C_lead,
    capture: leavers > 0 ? TP / leavers : null,
  };
}

/**
 * 1단계 순이익 곡선. ks: 0~1 배열. 순위 순서로 누적해 한 번에 계산한다.
 * @returns {{k:number,S:number,TP:number,net:number}[]}
 */
export function stage1Curve(left, rank, p, ks) {
  const n = left.length;
  const byRank = new Int32Array(n);
  for (let i = 0; i < n; i++) byRank[rank[i]] = i;
  const cumTP = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) cumTP[j + 1] = cumTP[j] + (left[byRank[j]] === 1 ? 1 : 0);
  return ks.map((k) => {
    const S = Math.min(n, Math.max(0, countFromRatio(n, k)));
    const TP = cumTP[S];
    return { k, S, TP, net: TP * p.r * p.C_replace - S * p.C_lead };
  });
}

// ---------------------------------------------------------------- 2단계

// 화면 표시 순서. expert는 scores.json에 needs_authority·leader_conflict가 있을 때만 계산할 수 있다.
export const STAGE2_METHODS = ['random', 'risk', 'expert', 'uplift', 'oracle'];

/** 이 stage2 자료로 계산할 수 있는 방법 목록 */
export function availableMethods(s2) {
  return STAGE2_METHODS.filter((id) => id !== 'expert' || (Array.isArray(s2.needs_authority) && Array.isArray(s2.leader_conflict)));
}

/** key 내림차순, 동점은 tiebreak 오름차순 */
function orderDesc(idx, key, tiebreak) {
  return idx.sort((a, b) => (key[b] - key[a]) || (tiebreak[a] - tiebreak[b]));
}

/**
 * 방법별 배분 계획: 임원 m명과, 남은 행의 팀장 배정 순서.
 * 임원 선정은 L과 무관하므로 한 번 만든 계획으로 여러 k를 계산할 수 있다.
 * @param {object} s2 scores.json의 stage2
 * @param {'random'|'risk'|'expert'|'uplift'|'oracle'} method
 * @param {{m:number,C_replace:number,C_lead:number,C_exec:number}} p
 */
export function stage2Plan(s2, method, p) {
  const n = s2.n ?? s2.left.length;
  const m = p.m;
  if (!Number.isInteger(m) || m < 0 || m > n) throw new RangeError(`임원 슬롯 m=${m}이 0~${n} 범위를 벗어났습니다`);
  const tb = s2.tiebreak;
  const all = Array.from({ length: n }, (_, i) => i);
  let exec;
  let rest;
  if (method === 'random' || method === 'risk') {
    const ordered = method === 'random'
      ? all.sort((a, b) => tb[a] - tb[b])
      : orderDesc(all, s2.risk, tb);
    exec = ordered.slice(0, m);
    rest = ordered.slice(m);
  } else if (method === 'expert') {
    // HR 전문가 규칙: 위험 순서에서 권한 필요자를 먼저 임원에, 모자라면 나머지로 채움.
    // 팀장은 남은 행 중 팀장 갈등이 없는 사람만(그래서 L보다 적을 수 있음)
    const na = s2.needs_authority;
    const lc = s2.leader_conflict;
    if (!na || !lc) throw new Error('expert 방법에는 needs_authority·leader_conflict가 필요합니다');
    const ordered = orderDesc(all, s2.risk, tb);
    const need = ordered.filter((i) => na[i] === 1);
    exec = need.slice(0, m);
    if (exec.length < m) exec = exec.concat(ordered.filter((i) => na[i] !== 1).slice(0, m - exec.length));
    const taken = new Uint8Array(n);
    for (const i of exec) taken[i] = 1;
    rest = ordered.filter((i) => !taken[i] && lc[i] === 0);
  } else if (method === 'uplift' || method === 'oracle') {
    const tl = method === 'uplift' ? s2.tau_hat_lead : s2.tau_lead;
    const te = method === 'uplift' ? s2.tau_hat_exec : s2.tau_exec;
    const vLead = new Float64Array(n);
    const gain = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const vl = tl[i] * p.C_replace - p.C_lead;
      const ve = te[i] * p.C_replace - p.C_exec;
      vLead[i] = vl;
      gain[i] = ve - Math.max(vl, 0);
    }
    const byGain = orderDesc(all, gain, tb);
    exec = byGain.slice(0, m);
    rest = orderDesc(byGain.slice(m), vLead, tb);
  } else {
    throw new Error(`알 수 없는 방법: ${method}`);
  }
  // 채점은 모든 방법 공통으로 진짜 효과 사용
  let execSaved = 0;
  for (const i of exec) execSaved += s2.tau_exec[i];
  const cumSaved = new Float64Array(rest.length + 1);
  const cumBackfire = new Int32Array(rest.length + 1);
  for (let j = 0; j < rest.length; j++) {
    const t = s2.tau_lead[rest[j]];
    cumSaved[j + 1] = cumSaved[j] + t;
    cumBackfire[j + 1] = cumBackfire[j] + (t < 0 ? 1 : 0);
  }
  return { n, m, method, exec, rest, execSaved, cumSaved, cumBackfire };
}

/**
 * 계획에서 팀장 L명을 정해 채점. m + L > n 이면 null.
 * 팀장 후보가 L명보다 적으면(expert) 실제 배정 인원만큼만 배정하고 비용도 그 인원으로 계산한다.
 */
export function scorePlan(plan, L, p) {
  if (L < 0 || plan.m + L > plan.n) return null;
  const lead = Math.min(L, plan.rest.length);
  const saved = plan.execSaved + plan.cumSaved[lead];
  return {
    exec: plan.m,
    lead,
    saved,
    net: saved * p.C_replace - plan.m * p.C_exec - lead * p.C_lead,
    backfire: plan.cumBackfire[lead],
  };
}

/** 한 방법의 배분과 채점. assign[i]: 0 = 없음, 1 = 팀장, 2 = 임원 */
export function stage2Allocate(s2, method, p) {
  const plan = stage2Plan(s2, method, p);
  const L = countFromRatio(plan.n, p.k);
  if (plan.m + L > plan.n) throw new RangeError(`m + L = ${plan.m + L}이 시험 인원 ${plan.n}보다 많습니다`);
  const res = scorePlan(plan, L, p);
  const assign = new Uint8Array(plan.n);
  for (const i of plan.exec) assign[i] = 2;
  for (let j = 0; j < res.lead; j++) assign[plan.rest[j]] = 1;
  return { ...res, assign };
}

/** 방법들을 모두 계산하고 상한 대비 %를 붙인다. */
export function stage2All(s2, p, methods = availableMethods(s2)) {
  const out = {};
  for (const id of methods) out[id] = stage2Allocate(s2, id, p);
  const oracleNet = out.oracle ? out.oracle.net : null;
  for (const id of methods) {
    out[id].pct = oracleNet != null && oracleNet > 0 ? (out[id].net / oracleNet) * 100 : null;
  }
  return out;
}

/** 2단계 순이익 곡선(m 고정, k 변화). m + L > n 인 점은 net = null */
export function stage2Curve(s2, method, p, ks) {
  const plan = stage2Plan(s2, method, p);
  return ks.map((k) => {
    const L = countFromRatio(plan.n, k);
    const r = scorePlan(plan, L, p);
    return { k, L, net: r ? r.net : null };
  });
}

// ---------------------------------------------------------------- 입력 검사

/**
 * 입력 검사. 반환: { ok, values, errors: {필드: 문구} }
 * raw는 화면 단위: C_* 는 만 원, k는 %, r는 0~1, m은 명.
 */
export function validateInputs(raw, { n1, n2 }) {
  const errors = {};
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  const v = {
    C_replace: num(raw.C_replace),
    C_lead: num(raw.C_lead),
    C_exec: num(raw.C_exec),
    r: num(raw.r),
    kPct: num(raw.k),
    mPct: num(raw.m),
  };
  const need = (key, label) => {
    if (raw[key] === '' || raw[key] == null) { errors[key] = `${label} 값을 입력해 주십시오.`; return false; }
    const vk = key === 'k' ? 'kPct' : key === 'm' ? 'mPct' : key;
    if (!Number.isFinite(v[vk])) { errors[key] = `${label} 칸에는 숫자를 넣어 주십시오.`; return false; }
    return true;
  };
  if (need('C_replace', '대체 비용') && !(v.C_replace > 0)) errors.C_replace = '대체 비용은 0보다 커야 합니다.';
  if (need('C_lead', '팀장 면담 비용') && v.C_lead < 0) errors.C_lead = '비용은 0 이상이어야 합니다.';
  if (need('C_exec', '임원 면담 비용') && v.C_exec < 0) errors.C_exec = '비용은 0 이상이어야 합니다.';
  if (need('r', '면담 성공률') && (v.r < 0 || v.r > 1)) errors.r = '성공률은 0~1 사이 값입니다(예: 0.3).';
  if (need('k', '면담 대상 비율') && (v.kPct < 0 || v.kPct > 100)) errors.k = '비율은 0~100% 사이입니다.';
  if (need('m', '임원 면담 비율') && (v.mPct < 0 || v.mPct > 100)) errors.m = '비율은 0~100% 사이입니다.';
  const k = v.kPct / 100;
  // 임원 면담 인원은 사람 수라서 소수점을 버린다(2026-11-17 사용자 결정). 예: 2,700명 × 5% = 135명
  const m = !errors.m && n2 != null ? floorCount(n2, v.mPct) : null;
  if (!errors.k && !errors.m && n2 != null) {
    const L = countFromRatio(n2, k);
    if (m + L > n2) errors.m = `임원 ${m}명 + 팀장 ${L}명이 시험 인원 ${n2}명보다 많습니다. k나 m을 줄여 주십시오.`;
  }
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    values: ok ? {
      C_replace: v.C_replace * 10000,
      C_lead: v.C_lead * 10000,
      C_exec: v.C_exec * 10000,
      r: v.r,
      k,
      m,
      mPct: v.mPct,
    } : null,
  };
}

// ---------------------------------------------------------------- 공정성(P1)

/**
 * 집단별 배정 비율·포착률. assigns = { risk, expert?, uplift? } 각각 stage2Allocate의 assign.
 * 결과의 방법 키마다 exec_rate·lead_rate, risk에는 capture도 붙인다.
 * 포착률(위험 순) = 그 집단 퇴사자(left=1) 중 면담(팀장·임원)에 배정된 비율(면담 갈래가 섞인 관측 결과 기준).
 */
export function fairnessTable(s2, assigns) {
  const groups = [
    ...['30세 미만', '30대', '40대', '50세 이상'].map((g) => ({ group: g, type: 'age', key: 'age_band' })),
    ...['남', '여'].map((g) => ({ group: g, type: 'gender', key: 'gender' })),
  ];
  const n = s2.left.length;
  const ids = Object.keys(assigns).filter((id) => assigns[id]);
  return groups.map(({ group, type, key }) => {
    const col = s2[key];
    let cnt = 0, leavers = 0, capR = 0;
    const e = Object.fromEntries(ids.map((id) => [id, 0]));
    const l = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let i = 0; i < n; i++) {
      if (col[i] !== group) continue;
      cnt++;
      for (const id of ids) {
        const a = assigns[id][i];
        if (a === 2) e[id]++; else if (a === 1) l[id]++;
      }
      if (s2.left[i] === 1) { leavers++; if (assigns.risk && assigns.risk[i] > 0) capR++; }
    }
    const rate = (x) => (cnt > 0 ? x / cnt : null);
    const row = { group, type, count: cnt, share: n > 0 ? cnt / n : null };
    for (const id of ids) row[id] = { exec_rate: rate(e[id]), lead_rate: rate(l[id]) };
    if (row.risk) row.risk.capture = leavers > 0 ? capR / leavers : null;
    return row;
  });
}
