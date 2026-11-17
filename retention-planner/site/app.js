// 리텐션 면담 우선순위 시뮬레이터 — 화면 동작
// 계산은 모두 alloc.js(DATA_CONTRACT "웹 계산 규칙")를 쓴다. 외부 라이브러리 없음.
import {
  countFromRatio, floorCount, stage1TopK, stage1Threshold, stage1Curve,
  stage2All, stage2Curve, validateInputs, fairnessTable, STAGE2_METHODS, availableMethods,
} from './alloc.js?v=20261117e';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- 숫자 표기
const MINUS = '−';
function fmtWon(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const sign = x < 0 ? MINUS : '';
  const a = Math.abs(x);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}억 원`;
  return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만 원`;
}
function shortWon(x) {
  const sign = x < 0 ? MINUS : '';
  const a = Math.abs(x);
  if (a >= 1e8) return `${sign}${+(a / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a)}`;
}
const fmtPct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const fmtN = (x, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', MINUS));
const fmtInt = (x) => (x == null ? '—' : Number(x).toLocaleString('ko-KR'));
const fmtPpl = (x) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x).toLocaleString('ko-KR') : x.toFixed(1)));
const negCls = (x) => (x != null && x < 0 ? ' class="neg"' : '');

// ---------------------------------------------------------------- 계열 모양(색 + 선 무늬)
const S1_STYLE = {
  random: { color: 'var(--s-base)', dash: '6 4', cls: 'dash' },
  tenure: { color: 'var(--s-base)', dash: '2 3', cls: 'dot' },
  logit: { color: 'var(--s-blue)' },
  rf: { color: 'var(--s-aqua)' },
  hgb: { color: 'var(--s-purple)' },
  gb: { color: 'var(--s-orange)' },
  tabicl: { color: 'var(--s-ink)', dash: '8 3', cls: 'dash' },  // 11-17 추가: 별도 환경에서 미리 계산한 사전학습 모델
};
const S2_STYLE = {
  random: { color: 'var(--s-base)', dash: '6 4', cls: 'dash' },
  risk: { color: 'var(--s-blue)' },
  uplift: { color: 'var(--s-purple)' },
  oracle: { color: 'var(--s-ink)', dash: '2 3', cls: 'dot' },
  expert: { color: 'var(--s-aqua)' },
};
const S2_LABEL = { random: '무작위', risk: '위험 순', expert: 'HR 전문가 규칙', uplift: '효과 순(T-learner)', oracle: '진짜 효과 순(상한)' };
const EXPERT_NOTE = '모델 없이 현업 지식만 쓴 기준선입니다. 시나리오 B와 같은 경험으로 만들어 앞서는 게 당연하며, 실제로 맞다는 증거는 아닙니다.';
const styleOf = (map, id) => map[id] ?? { color: 'var(--s-ink)', dash: '1 3', cls: 'dot' };
const swatch = (st) => `<span class="swatch ${st.cls ?? ''}" style="color:${st.color}" aria-hidden="true"></span>`;

// ---------------------------------------------------------------- 인라인 SVG 선 그래프
function niceTicks(lo, hi, count = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return t;
}

const charts = new Set();
const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      const w = Math.round(e.contentRect.width);
      if (el._chart && w !== el._lastW) drawChart(el);
    }
  })
  : null;

/**
 * o = { series:[{id,label,style,points:[{x,y}]}], xDomain, yDomain?, includeZero, xTickFmt, yTickFmt,
 *       xFmt, yFmt, curX, markMax, refLine:[[x,y],[x,y]], refLabel, ariaLabel, axisNote }
 */
function lineChart(el, o) {
  el._chart = o;
  if (!charts.has(el)) { charts.add(el); ro?.observe(el); }
  drawChart(el);
}

function drawChart(el) {
  const o = el._chart;
  const W = Math.max(260, Math.round(el.clientWidth || 600));
  el._lastW = Math.round(el.clientWidth);
  const H = o.height ?? (W < 480 ? 230 : 280);
  const M = { l: o.ml ?? 54, r: 14, t: 14, b: 30 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const [x0, x1] = o.xDomain;
  let ys = [];
  for (const s of o.series) for (const p of s.points) if (p.y != null && Number.isFinite(p.y)) ys.push(p.y);
  if (o.refLine) ys.push(o.refLine[0][1], o.refLine[1][1]);
  let [y0, y1] = o.yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!ys.length) { y0 = 0; y1 = 1; }
  if (o.includeZero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  if (!o.yDomain) { const pad = (y1 - y0) * 0.06 || 1; y0 -= y0 < 0 ? pad : 0; y1 += pad; }
  const yt = niceTicks(y0, y1, W < 480 ? 4 : 5);
  if (!o.yDomain) { y0 = Math.min(y0, yt[0]); y1 = Math.max(y1, yt[yt.length - 1]); }
  const xt = niceTicks(x0, x1, W < 480 ? 4 : 5);
  const X = (x) => M.l + ((x - x0) / (x1 - x0)) * iw;
  const Y = (y) => M.t + ih - ((y - y0) / (y1 - y0)) * ih;

  let g = '';
  for (const t of yt) {
    if (t < y0 - 1e-12 || t > y1 + 1e-12) continue;
    g += `<line class="${t === 0 ? 'zero' : 'gridl'}" x1="${M.l}" x2="${M.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>`;
    g += `<text x="${M.l - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(o.yTickFmt(t))}</text>`;
  }
  for (const t of xt) {
    g += `<text x="${X(t)}" y="${M.t + ih + 18}" text-anchor="middle">${esc(o.xTickFmt(t))}</text>`;
  }
  g += `<line class="axis" x1="${M.l}" x2="${M.l + iw}" y1="${M.t + ih}" y2="${M.t + ih}"/>`;
  if (o.refLine) {
    const [[a, b], [c, d]] = o.refLine;
    g += `<line x1="${X(a)}" y1="${Y(b)}" x2="${X(c)}" y2="${Y(d)}" style="stroke:var(--muted);stroke-dasharray:4 4;stroke-width:1"/>`;
    if (o.refLabel) g += `<text x="${X(c) - 4}" y="${Y(d) + 14}" text-anchor="end">${esc(o.refLabel)}</text>`;
  }
  if (o.curX != null) g += `<line class="cur" x1="${X(o.curX)}" x2="${X(o.curX)}" y1="${M.t}" y2="${M.t + ih}"/>`;
  // 선
  for (const s of o.series) {
    let d = '';
    let pen = false;
    for (const p of s.points) {
      if (p.y == null || !Number.isFinite(p.y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`;
      pen = true;
    }
    g += `<path d="${d}" fill="none" style="stroke:${s.style.color};stroke-width:2;stroke-linejoin:round;stroke-linecap:round${s.style.dash ? `;stroke-dasharray:${s.style.dash}` : ''}"/>`;
    if (o.dots) {
      for (const p of s.points) if (p.y != null) g += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5" style="fill:${s.style.color};stroke:var(--paper);stroke-width:1.5"/>`;
    }
  }
  // 최대점
  if (o.markMax) {
    for (const s of o.series) {
      let best = null;
      for (const p of s.points) if (p.y != null && (best == null || p.y > best.y)) best = p;
      if (best) g += `<circle cx="${X(best.x)}" cy="${Y(best.y)}" r="4.5" style="fill:${s.style.color};stroke:var(--paper);stroke-width:2"><title>${esc(s.label)} 최대: ${esc(o.xFmt(best.x))}, ${esc(o.yFmt(best.y))}</title></circle>`;
    }
  }
  g += `<line class="cross" x1="0" x2="0" y1="${M.t}" y2="${M.t + ih}" visibility="hidden"/>`;
  g += `<rect class="hit" x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent"/>`;

  const legend = o.series.length > 1
    ? `<div class="legend">${o.series.map((s) => `<span>${swatch(s.style)}${esc(s.label)}</span>`).join('')}</div>`
    : '';
  el.innerHTML = `${o.axisNote ? `<div class="caption" style="margin:0 0 4px">${esc(o.axisNote)}</div>` : ''}${legend}
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.ariaLabel)}">${g}</svg><div class="tip" hidden></div></div>`;

  // 마우스·터치 위치의 값 안내
  const svg = el.querySelector('svg');
  const tip = el.querySelector('.tip');
  const cross = svg.querySelector('.cross');
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const xv = x0 + ((px - M.l) / iw) * (x1 - x0);
    const rows = [];
    let cx = null;
    for (const s of o.series) {
      let best = null;
      for (const p of s.points) if (p.y != null && (best == null || Math.abs(p.x - xv) < Math.abs(best.x - xv))) best = p;
      if (!best) continue;
      if (cx == null) cx = best.x;
      rows.push(`<div>${swatch(s.style)} ${esc(s.label)} <b>${esc(o.yFmt(best.y))}</b>${o.shareX ? '' : ` <span class="mu">(${esc(o.xFmt(best.x))})</span>`}</div>`);
    }
    if (cx == null) return;
    cross.setAttribute('x1', X(cx)); cross.setAttribute('x2', X(cx)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `${o.shareX ? `<div class="mu">${esc(o.xFmt(cx))}</div>` : ''}${rows.join('')}`;
    tip.hidden = false;
    const scale = rect.width / W;
    const left = X(cx) * scale + 12;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, left + tw > rect.width ? X(cx) * scale - tw - 12 : left)}px`;
    tip.style.top = `${M.t * scale}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', hide);
}

// ---------------------------------------------------------------- 데이터 읽기
async function getJson(path, required) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    if (required) throw new Error(`${path} 읽기 실패 (${err.message})`);
    return null;
  }
}

async function loadData() {
  const [meta, sA, mA, sB, mB] = await Promise.all([
    getJson('data/meta.json', true),
    getJson('data/A/scores.json', true), getJson('data/A/metrics.json', true),
    getJson('data/B/scores.json', true), getJson('data/B/metrics.json', true),
  ]);
  const opt = (p) => getJson(p, false);
  const [cA, iA, fA, cB, iB, fB, sens] = await Promise.all([
    opt('data/A/calibration.json'), opt('data/A/importance.json'), opt('data/A/fairness.json'),
    opt('data/B/calibration.json'), opt('data/B/importance.json'), opt('data/B/fairness.json'),
    opt('data/sensitivity.json'),
  ]);
  return {
    meta,
    sensitivity: sens,
    A: { scores: sA, metrics: mA, calibration: cA, importance: iA, fairness: fA },
    B: { scores: sB, metrics: mB, calibration: cB, importance: iB, fairness: fB },
  };
}

// ---------------------------------------------------------------- 상태
const state = { data: null, scenario: 'A', vals: null, last: null };
const FIELDS = ['C_replace', 'C_lead', 'C_exec', 'r', 'k', 'm'];
// 예시값: meta.json의 default_inputs가 있으면 그 값(PRD §7 예시), 없으면 PRD §7 값
const exampleValues = () => {
  const di = state.data.meta.default_inputs ?? {};
  const won = (x, fb) => String(x != null ? x / 10000 : fb);
  return {
    C_replace: won(di.C_replace, 3000), C_lead: won(di.C_lead, 30), C_exec: won(di.C_exec, 150),
    r: String(di.r ?? 0.3), k: String(di.k != null ? Math.round(di.k * 100) : 20),
    // 임원 면담은 비율(%)로 입력한다. meta의 예시값이 인원이면 시험 인원 대비 비율로 바꾼다(135명 ÷ 2,700명 = 5%).
    m: String(di.m != null ? Math.round((di.m / state.data.A.scores.stage2.n) * 1000) / 10 : 5),
  };
};

function readRaw() {
  const raw = {};
  for (const f of FIELDS) raw[f] = $(`in-${f}`).value.trim();
  return raw;
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; update(); });
}

// 빠른 입력 막대(11-17): 위쪽 입력의 현재 값을 막대에 보여 준다. 사용자가 막대 칸에 입력 중이면 덮어쓰지 않는다.
function syncQuickbar(raw, n2) {
  const k = Number(raw.k), m = Number(raw.m);
  const okK = raw.k !== '' && Number.isFinite(k), okM = raw.m !== '' && Number.isFinite(m) && m >= 0 && m <= 100;
  if (okK) $('qb-k').value = raw.k;
  if (okM) $('qb-m').value = raw.m;
  $('qb-k-v').textContent = okK ? `${k}%` : '—';
  $('qb-m-v').textContent = okM ? `${m}% = ${fmtInt(floorCount(n2, m))}명` : '—';
  if (document.activeElement !== $('qb-C_replace')) $('qb-C_replace').value = raw.C_replace;
}

function update() {
  const d = state.data;
  const raw = readRaw();
  const n1 = d.A.scores.stage1.n;
  const n2 = d.A.scores.stage2.n;
  const v = validateInputs(raw, { n1, n2 });
  const anyFilled = FIELDS.some((f) => raw[f] !== '');
  for (const f of FIELDS) {
    // 아무것도 안 넣은 처음 화면에서는 "입력해 주십시오"를 띄우지 않는다
    const msg = anyFilled ? (v.errors[f] ?? '') : '';
    $(`err-${f}`).textContent = msg;
    $(`in-${f}`).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  // 슬라이더 동기화
  for (const f of ['k', 'm']) {
    const rg = $(`rg-${f}`);
    if (raw[f] !== '' && Number.isFinite(Number(raw[f]))) { rg.value = raw[f]; rg.classList.remove('unset'); } else rg.classList.add('unset');
  }
  // 임원 면담 비율 → 인원(소수점 버림)을 칸 아래에 바로 보여 준다
  const mPct = Number(raw.m);
  $('m-count').textContent = raw.m !== '' && Number.isFinite(mPct) && mPct >= 0 && mPct <= 100
    ? `= ${fmtInt(floorCount(n2, mPct))}명 (소수점 버림)` : '';
  syncQuickbar(raw, n2);
  const ex = exampleValues();
  $('example-on').hidden = !FIELDS.every((f) => Number(raw[f]) === Number(ex[f]) && raw[f] !== '');

  state.vals = v.ok ? v.values : null;
  renderStage1();
  renderExplain();
  renderStage2();
  renderP1();
  renderSummary();
}

const placeholder = (msg = '위 입력을 모두 채우면 계산합니다. "예시값 채우기"로 시작해 볼 수 있습니다.') => `<div class="placeholder">${esc(msg)}</div>`;

// ---------------------------------------------------------------- 1단계
function renderStage1() {
  const d = state.data;
  const s1 = d.A.scores.stage1; // 1단계는 시나리오와 무관(DATA_CONTRACT)
  const m1 = d.A.metrics.stage1;
  const vals = state.vals;
  const leavers = s1.left.reduce((a, b) => a + b, 0);
  const results = {};
  if (vals) {
    for (const m of s1.methods) {
      results[m.id] = { top: stage1TopK(s1.left, m.rank, vals), thr: stage1Threshold(s1.left, m.prob, vals) };
    }
  }

  // 카드(F2·F13)
  if (!vals) $('s1-cards').innerHTML = placeholder();
  else {
    const S = results[s1.methods[0].id].top.S;
    let html = `<p class="headline">시험 대조군 <b>${fmtInt(s1.n)}명</b>(실제 퇴사 ${fmtInt(leavers)}명) 중 위험 점수 상위 <b>${fmtPct(vals.k, 0)} = ${fmtInt(S)}명</b>을 면담할 때</p><div class="grid">`;
    for (const m of s1.methods) {
      const { top, thr } = results[m.id];
      const st = styleOf(S1_STYLE, m.id);
      const best = m.id === s1.best;
      html += `<article class="mcard${best ? ' best' : ''}">
        <h3>${swatch(st)}${esc(m.label)} ${best ? '<span class="badge">대표 모델</span>' : `<span class="badge gray">${m.kind === 'model' ? '모델' : '기준선'}</span>`}</h3>
        <div class="kv"><span>면담 안 하면 떠났을 사람</span><b>${fmtInt(top.TP)}명 <span class="mu">(퇴사자의 ${fmtPct(top.capture, 0)})</span></b></div>
        <div class="kv kv-sub"><span>├ 면담 후 재직(예상)</span><b>${fmtPpl(top.TP * vals.r)}명</b></div>
        <div class="kv kv-sub"><span>└ 면담 후에도 퇴사(예상)</span><b>${fmtPpl(top.TP * (1 - vals.r))}명</b></div>
        <div class="kv"><span>면담 없이도 재직했을 사람</span><b>${fmtInt(top.unneeded)}명</b></div>
        <div class="kv"><span>예상 순이익</span><b${negCls(top.net)}>${fmtWon(top.net)}</b></div>
        <div class="formula">= 면담 후 재직 ${fmtPpl(top.TP * vals.r)}명 × ${fmtWon(vals.C_replace)} − 면담 ${fmtInt(top.S)}명 × ${fmtWon(vals.C_lead)}</div>
        ${thr ? `<div class="sub">비용 기준으로 고르면: <b>${fmtInt(thr.S)}명</b> 면담 · 면담 후 재직(예상) <b>${fmtPpl(thr.TP * vals.r)}명</b> · 순이익 <b>${fmtWon(thr.net)}</b></div>`
    : '<div class="sub mu">확률이 없는 순서 규칙이라 비용 기준 선택을 쓸 수 없습니다.</div>'}
        ${m.id === 'tabicl' ? '<div class="sub mu">교안 17번의 사전학습 표 모델입니다. 브라우저에서 돌릴 수 없어 별도 환경(Python 3.13, CPU 약 17분)에서 미리 계산한 점수를 씁니다. 대표 모델 선택에는 넣지 않았습니다.</div>' : ''}
      </article>`;
    }
    html += '</div>';
    $('s1-cards').innerHTML = html;
  }

  // 곡선(F4)
  if (!vals) { $('s1-curve').innerHTML = placeholder(); $('s1-curve')._chart = null; }
  else {
    const ks = Array.from({ length: 101 }, (_, i) => i / 100);
    lineChart($('s1-curve'), {
      series: s1.methods.map((m) => ({
        id: m.id, label: m.label, style: styleOf(S1_STYLE, m.id),
        points: stage1Curve(s1.left, m.rank, vals, ks).map((p) => ({ x: p.k, y: p.net })),
      })),
      xDomain: [0, 1], includeZero: true, markMax: true, curX: vals.k, shareX: true,
      xTickFmt: (x) => `${Math.round(x * 100)}%`, yTickFmt: shortWon,
      xFmt: (x) => `상위 ${Math.round(x * 100)}% (${countFromRatio(s1.n, x)}명)`, yFmt: fmtWon,
      ariaLabel: '1단계 방법별 면담 대상 비율 k에 따른 예상 순이익 곡선',
      axisNote: '세로: 예상 순이익 · 가로: 면담 대상 비율 k',
    });
  }

  // 비교표(F3)
  const byId = Object.fromEntries(m1.methods.map((m) => [m.id, m]));
  let t = `<div class="tw"><table><thead><tr><th>방법</th><th class="n">정확도</th><th class="n">ROC AUC</th><th class="n">Brier(보정 후)</th>
    <th class="n">포착률@10%</th><th class="n">포착률@20%</th><th class="n">리프트@10%</th><th class="n">리프트@20%</th><th class="n">순이익@${vals ? fmtPct(vals.k, 0) : 'k'}</th></tr></thead><tbody>`;
  for (const m of s1.methods) {
    const x = byId[m.id] ?? {};
    t += `<tr${m.id === s1.best ? ' class="hl"' : ''}><td>${swatch(styleOf(S1_STYLE, m.id))} ${esc(m.label)}${m.id === s1.best ? ' <span class="badge">대표</span>' : ''}</td>
      <td class="n">${fmtN(x.accuracy)}</td><td class="n">${fmtN(x.auc)}</td><td class="n">${fmtN(x.brier_cal)}</td>
      <td class="n">${fmtPct(x.capture?.['10'])}</td><td class="n">${fmtPct(x.capture?.['20'])}</td>
      <td class="n">${fmtN(x.lift?.['10'], 2)}</td><td class="n">${fmtN(x.lift?.['20'], 2)}</td>
      <td class="n">${vals ? fmtWon(results[m.id].top.net) : '—'}</td></tr>`;
  }
  t += `</tbody></table></div><p class="caption">전원 재직 정확도(모두 "남는다"고만 답할 때) <b>${fmtN(m1.all_stay_accuracy)}</b> · 시험 대조군 ${fmtInt(m1.n_test)}명 · 실제 퇴사 비율 ${fmtPct(m1.leave_rate)}. 정확도는 문턱 0.5 기준이며 점수가 없는 기준선은 "—"입니다. 순이익 열만 화면에서 계산하고 나머지는 metrics.json 값입니다.</p>`;
  $('s1-table').innerHTML = t;
}

// ---------------------------------------------------------------- 설명 카드(F5)
function renderExplain() {
  const d = state.data;
  const m1 = d.A.metrics.stage1;
  const best = m1.methods.find((m) => m.id === d.A.scores.stage1.best) ?? m1.methods[0];
  $('ex-accuracy').querySelector('.body').innerHTML = `
    <p>퇴사는 드문 일이라 "모두 남는다"고만 답해도 정확도가 높게 나옵니다. 이 시험 대조군에서는 그 답의 정확도가 <b>${fmtN(m1.all_stay_accuracy)}</b>입니다. 대표 모델(${esc(best.label)})의 정확도는 <b>${fmtN(best.accuracy)}</b>입니다.</p>
    <p>"모두 남는다"는 답은 퇴사자를 <b>한 명도 찾지 못합니다.</b> 그래서 정확도만 보지 않고, 상위 k%에 퇴사자가 얼마나 들어오는지(포착률)와 순이익을 함께 봅니다.</p>`;
  const v = state.vals;
  const cut = v && v.r > 0 ? v.C_lead / (v.r * v.C_replace) : null;
  $('ex-threshold').querySelector('.body').innerHTML = `
    <p>AUC가 높아도 <b>몇 명까지 면담할지</b>는 정해지지 않습니다. 면담 대상 비율 k는 예산과 면담 가능 인원을 보고 사람이 정합니다.</p>
    <p><b>비용 기준 선택(기대이익 문턱)</b>은 보정된 위험 확률 p로 "p × 성공률 r × 대체 비용 > 면담 비용"인 사람만 고르는 방법입니다.
    ${cut != null ? `지금 입력이면 <b>p &gt; ${fmtN(cut, 3)}</b>인 사람입니다.` : '입력을 채우면 지금 기준의 문턱 확률을 보여 드립니다.'}
    확률이 실제와 맞아야(보정) 이 계산이 의미가 있습니다.</p>`;
}

// ---------------------------------------------------------------- 2단계
function renderStage2() {
  const d = state.data;
  const scn = state.scenario;
  const D = d[scn];
  const s2 = D.scores.stage2;
  const m2 = D.metrics.stage2;
  const vals = state.vals;
  const meta = d.meta.scenarios?.[scn];
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scn === scn)));
  $('scn-desc').innerHTML = scn === 'A'
    ? '<b>A · 효과 균일:</b> 누구에게나 팀장 면담 효과가 같고 임원 면담은 언제나 약 2배입니다. 이때는 위험 순 배분이 거의 최선일 것으로 예상합니다. 효과 순이 이기지 않아도 그대로 보여 줍니다.'
    : `<b>B · 사유 × 권한 궁합:</b> 퇴사 사유를 해결할 권한이 있는 면담자일 때 효과가 큽니다. 팀장 갈등이 사유면 팀장 면담은 역효과일 수 있습니다. 이미 마음을 굳힌 사람(관측되지 않는 숨은 변수)은 어떤 면담에도 반응하지 않습니다${meta?.decided_rate != null ? `(이 데이터에서 ${fmtPct(meta.decided_rate)})` : ''}. 효과가 사람마다 크게 다르도록 <b>설계한 가정</b>이라 진짜 효과 순(상한)은 크게 앞서지만, 그 효과를 시범 기록으로 <b>추정해</b> 배분한 효과 순이 위험 순보다 낫다는 보장은 없습니다.`;
  $('p1-scn').textContent = `시나리오 ${scn} 기준`;

  const labelOf = (id) => m2.methods.find((m) => m.id === id)?.label ?? S2_LABEL[id] ?? id;
  let all = null;
  const methods = availableMethods(s2);
  if (vals) all = stage2All(s2, vals, methods);
  state.last = { ...(state.last ?? {}), all, scn };

  // 카드(F12)
  if (!all) $('s2-cards').innerHTML = placeholder();
  else {
    const L = all.risk.lead;
    const nonOracle = methods.filter((id) => id !== 'oracle');
    const winner = nonOracle.reduce((a, b) => (all[b].net > all[a].net ? b : a));
    let html = `<p class="headline">시험 전체 <b>${fmtInt(s2.n)}명</b> 중 임원 면담 <b>${fmtInt(vals.m)}명</b>(${vals.mPct}%) · 팀장 면담 <b>${fmtInt(L)}명</b>(${fmtPct(vals.k, 0)})을 배분할 때</p><div class="grid">`;
    for (const id of methods) {
      const r = all[id];
      const st = styleOf(S2_STYLE, id);
      html += `<article class="mcard${id === winner ? ' best' : ''}">
        <h3>${swatch(st)}${esc(labelOf(id))} ${id === 'oracle' ? '<span class="badge gray">가상 데이터라서만 가능</span>' : ''}${id === winner ? '<span class="badge">상한 제외 최고</span>' : ''}</h3>
        <div class="kv"><span>면담 인원 (임원 · 팀장)</span><b>${fmtInt(r.exec)}명 · ${fmtInt(r.lead)}명</b></div>
        <div class="kv"><span>면담 후 재직(예상)</span><b>${fmtN(r.saved, 1)}명</b></div>
        <div class="kv"><span>예상 순이익</span><b${negCls(r.net)}>${fmtWon(r.net)}</b></div>
        <div class="formula">= ${fmtN(r.saved, 1)}명 × ${fmtWon(vals.C_replace)} − (임원 ${fmtInt(r.exec)}명 × ${fmtWon(vals.C_exec)} + 팀장 ${fmtInt(r.lead)}명 × ${fmtWon(vals.C_lead)})</div>
        <div class="kv"><span>역효과 우려 (팀장 갈등자에게 팀장 면담)</span><b>${fmtInt(r.backfire)}명</b></div>
        <div class="kv"><span>최대치 대비</span><b>${r.pct == null ? '—' : `${r.pct.toFixed(1)}%`}</b></div>
        ${id === 'expert' ? `<div class="sub">위험 순서에서 권한이 필요한 사람(팀장 갈등, 또는 연봉·업무·회사 방향 만족이 낮음)을 먼저 임원에게 배정하고, 팀장 갈등이 있는 사람은 팀장 면담에서 뺍니다.${r.lead < all.risk.lead ? ` 갈등자를 빼서 팀장 배정이 ${fmtInt(all.risk.lead - r.lead)}명 적습니다.` : ''}</div>` : ''}
      </article>`;
    }
    const gap = all.oracle.net > 0 && all.uplift.pct != null && all.risk.pct != null
      ? `<div class="note" style="margin-top:12px">지금 입력에서 효과 순(추정 효과로 배분)의 순이익은 위험 순보다 <b>${all.uplift.net >= all.risk.net ? '높습니다' : '낮습니다'}</b>(최대치 대비 효과 순 ${all.uplift.pct.toFixed(1)}%, 위험 순 ${all.risk.pct.toFixed(1)}%). 진짜 효과를 알면(상한) ${fmtWon(all.oracle.net)}까지 가능합니다. ${all.uplift.net >= all.risk.net
        ? '<b>추정한 효과로도 위험 순을 넘었지만, 상한과의 격차만큼 개인별 추정 오차가 남아 있습니다.</b> 이 결과는 효과 추정 방법 선택에 크게 좌우됩니다(아래 민감도 표).'
        : '<b>이 조건에서는 추정한 효과가 위험 순보다 못합니다.</b> 효과가 모두 비슷하면 위험 순이 이미 최선에 가깝고, 효과 차이가 있어도 추정 오차가 크면 이득이 사라집니다.'}</div>`
      : '';
    const expertNote = all.expert ? `<div class="note"><b>HR 전문가 규칙:</b> ${esc(EXPERT_NOTE)}</div>` : '';
    html += `</div>${gap}${expertNote}<p class="caption">면담 후 재직(예상) = 면담 덕분에 남는 사람 수입니다. 사람마다 "면담으로 줄어드는 퇴사 확률"을 더한 값이라 소수가 나옵니다. 역효과 우려 = 팀장 면담을 받으면 오히려 퇴사 확률이 오르는 사람(예: 팀장 갈등이 사유)에게 팀장 면담을 배정한 수입니다. 최대치 = 진짜 면담 효과를 알 때의 순이익입니다. 이 값들은 진짜 효과로 채점한 것이라 실제 자료에서는 알 수 없습니다.</p>`;
    $('s2-cards').innerHTML = html;
  }

  // 곡선(F4, 2단계)
  $('s2-curve-m').textContent = vals ? `(임원 ${fmtInt(vals.m)}명 고정)` : '';
  if (!vals) { $('s2-curve').innerHTML = placeholder(); $('s2-curve')._chart = null; }
  else {
    const ks = Array.from({ length: 21 }, (_, i) => i / 20);
    lineChart($('s2-curve'), {
      series: methods.map((id) => ({
        id, label: labelOf(id), style: styleOf(S2_STYLE, id),
        points: stage2Curve(s2, id, vals, ks).map((p) => ({ x: p.k, y: p.net })),
      })),
      xDomain: [0, 1], includeZero: true, markMax: true, curX: vals.k, shareX: true,
      xTickFmt: (x) => `${Math.round(x * 100)}%`, yTickFmt: shortWon,
      xFmt: (x) => `팀장 ${Math.round(x * 100)}% (${countFromRatio(s2.n, x)}명)`, yFmt: fmtWon,
      ariaLabel: `2단계 시나리오 ${scn} 방법별 팀장 면담 비율에 따른 예상 순이익 곡선`,
      axisNote: '세로: 예상 순이익(진짜 효과로 채점) · 가로: 팀장 면담 비율 k',
    });
  }

  // 비교표(§9.3)
  const mById = Object.fromEntries(m2.methods.map((m) => [m.id, m]));
  let t = `<div class="tw"><table><thead><tr><th>방법</th><th class="n">Qini 팀장</th><th class="n">Qini 임원</th><th class="n">진짜 효과 상관 팀장</th><th class="n">진짜 효과 상관 임원</th>
    <th class="n">면담 후 재직(예상)</th><th class="n">역효과 우려</th><th class="n">순이익</th><th class="n">최대치 대비</th></tr></thead><tbody>`;
  for (const id of methods) {
    const x = mById[id] ?? {};
    const r = all?.[id];
    t += `<tr${id === 'uplift' ? ' class="hl"' : ''}><td>${swatch(styleOf(S2_STYLE, id))} ${esc(labelOf(id))}</td>
      <td class="n">${fmtN(x.qini_lead)}</td><td class="n">${fmtN(x.qini_exec)}</td>
      <td class="n">${fmtN(x.corr_lead, 2)}</td><td class="n">${fmtN(x.corr_exec, 2)}</td>
      <td class="n">${r ? fmtN(r.saved, 1) : '—'}</td><td class="n">${r ? fmtInt(r.backfire) : '—'}</td>
      <td class="n">${r ? fmtWon(r.net) : '—'}</td><td class="n">${r?.pct == null ? '—' : `${r.pct.toFixed(1)}%`}</td></tr>`;
  }
  t += `</tbody></table></div><p class="caption">시나리오 ${scn} · 시험 전체 ${fmtInt(m2.n_test)}명(대조 ${fmtInt(m2.arms?.none)} · 팀장 ${fmtInt(m2.arms?.lead)} · 임원 ${fmtInt(m2.arms?.exec)}). Qini·상관은 metrics.json 값, 나머지 열은 현재 입력으로 계산합니다. 진짜 효과 상관과 상한은 <b>가상 데이터라서 가능한 검증</b>입니다.</p>`;
  $('s2-table').innerHTML = t;

  // 효과 추정 방법 선택(metrics.json stage2.uplift_selection, 있을 때만)
  const sel = m2.uplift_selection;
  const us = $('uplift-select');
  if (!sel) { us.hidden = true; us.innerHTML = ''; }
  else {
    us.hidden = false;
    const cands = Object.entries(sel.cv_qini ?? {}).sort((a, b) => b[1] - a[1])
      .map(([id, q]) => `${id === sel.chosen ? '<b>' : ''}${esc(sel.labels?.[id] ?? id)} ${fmtN(q, 4)}${id === sel.chosen ? '</b>' : ''}`).join(' · ');
    us.innerHTML = `효과 추정 방법은 시험 자료가 아니라 <b>훈련 자료 교차 검증 Qini</b>로 골랐습니다(시나리오 ${scn}: <b>${esc(sel.label ?? sel.chosen)}</b>). 후보별 교차 검증 Qini: ${cands}.${sel.rule ? ` <span class="mu">규칙: ${esc(sel.rule)}</span>` : ''}`;
  }
}

// ---------------------------------------------------------------- P1
const notReady = (what) => `<div class="placeholder">준비 중입니다 · ${esc(what)} 결과 파일이 아직 없습니다.</div>`;

function renderP1() {
  const d = state.data;
  const scn = state.scenario;
  const D = d[scn];

  // F15 Qini 곡선
  const qc = D.metrics.stage2?.qini_curves;
  const qBody = $('card-qini').querySelector('.body');
  if (!qc) qBody.innerHTML = notReady('Qini 곡선');
  else {
    const ids = STAGE2_METHODS.filter((id) => qc[id]).concat(Object.keys(qc).filter((id) => !STAGE2_METHODS.includes(id)));
    const labelOf = (id) => D.metrics.stage2.methods.find((m) => m.id === id)?.label ?? S2_LABEL[id] ?? id;
    qBody.innerHTML = '<h3 style="font-size:.92rem;margin:4px 0 0">팀장 면담</h3><div id="qini-lead"></div><h3 style="font-size:.92rem;margin:10px 0 0">임원 면담</h3><div id="qini-exec"></div><p class="caption">가로: 점수 높은 순으로 고른 대상 비율 · 세로: 누적 면담 후 재직 인원(대조군과 면담군의 관측 결과로 계산). 무작위 선보다 위로 볼록할수록 효과 순으로 잘 줄 세운 것입니다. 행마다 정답이 없어서 AUC 대신 이 곡선으로 채점합니다.</p>';
    for (const arm of ['lead', 'exec']) {
      lineChart($(`qini-${arm}`), {
        series: ids.filter((id) => qc[id]?.[arm]).map((id) => ({
          id, label: labelOf(id), style: styleOf(S2_STYLE, id),
          points: qc[id][arm].map(([x, y]) => ({ x, y })),
        })),
        xDomain: [0, 1], includeZero: true, height: 210, shareX: true,
        xTickFmt: (x) => `${Math.round(x * 100)}%`, yTickFmt: (y) => fmtN(y, Number.isInteger(y) ? 0 : 1),
        xFmt: (x) => `상위 ${Math.round(x * 100)}%`, yFmt: (y) => `${fmtN(y, 1)}명`,
        ariaLabel: `시나리오 ${scn} ${arm === 'lead' ? '팀장' : '임원'} 면담 Qini 곡선`,
      });
    }
  }

  // F7 요인 중요도
  const imp = D.importance;
  const iBody = $('card-importance').querySelector('.body');
  if (!imp) iBody.innerHTML = notReady('요인 중요도');
  else {
    const list = (rows, title) => {
      if (!rows?.length) return `<div><h3 style="font-size:.92rem">${esc(title)}</h3>${notReady(title)}</div>`;
      const top = rows.slice(0, 8);
      const max = Math.max(...top.map((r) => (r.mean ?? 0) + (r.std ?? 0)), 1e-12);
      return `<div><h3 style="font-size:.92rem">${esc(title)}</h3><div class="bars">${top.map((r) => {
        const w = Math.max(0, (r.mean / max) * 100);
        const e0 = Math.max(0, ((r.mean - (r.std ?? 0)) / max) * 100);
        const e1 = Math.min(100, ((r.mean + (r.std ?? 0)) / max) * 100);
        return `<div class="bar" title="${esc(r.label)}: 평균 ${fmtN(r.mean, 4)} ± ${fmtN(r.std, 4)}"><span>${esc(r.label)}</span><span class="track"><span class="fill" style="width:${w}%"></span><span class="err-bar" style="left:${e0}%;width:${Math.max(0.5, e1 - e0)}%"></span></span><span class="v">${fmtN(r.mean, 3)}</span></div>`;
      }).join('')}</div></div>`;
    };
    iBody.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))">${list(imp.risk, '위험(1단계 대표 모델)')}${list(imp.uplift_exec, '임원 면담 추정 효과')}</div>
      ${imp.note ? `<p class="caption">측정값: ${esc(imp.note)}</p>` : ''}
      <p class="caption"><b>원인이 아니라 상관입니다.</b> 순열 중요도(그 열을 섞었을 때 값이 변하는 정도, 막대 위 짧은 선은 ± 표준편차)로, "이 요인 때문에 떠난다"는 뜻이 아닙니다. 서로 상관이 높은 열(근속·나이·승진 후 기간)은 중요도가 나뉘어 보일 수 있습니다.</p>`;
  }

  // F8 공정성 — scores.json의 집단 열로 현재 입력 기준 직접 계산
  const fBody = $('card-fairness').querySelector('.body');
  const s2 = D.scores.stage2;
  const all = state.last?.all;
  if (!s2.age_band || !s2.gender) fBody.innerHTML = notReady('집단 열');
  else if (!state.vals || !all) fBody.innerHTML = placeholder('입력을 채우면 지금 배분 기준으로 집단별 비율을 계산합니다.');
  else {
    const fm = [['risk', '위험 순'], ['expert', '규칙'], ['uplift', '효과 순']].filter(([id]) => all[id]);
    const rows = fairnessTable(s2, Object.fromEntries(fm.map(([id]) => [id, all[id].assign])));
    fBody.innerHTML = `<div class="tw"><table><thead><tr><th>집단</th><th class="n">인원 비중</th>${fm.map(([, l]) => `<th class="n">임원 배정 · ${l}</th>`).join('')}${fm.map(([, l]) => `<th class="n">팀장 배정 · ${l}</th>`).join('')}<th class="n">포착률 · 위험 순</th></tr></thead><tbody>
      ${rows.map((g) => `<tr><td>${esc(g.group)}</td><td class="n">${fmtPct(g.share)} <span class="mu">(${fmtInt(g.count)})</span></td>
        ${fm.map(([id]) => `<td class="n">${fmtPct(g[id].exec_rate)}</td>`).join('')}${fm.map(([id]) => `<td class="n">${fmtPct(g[id].lead_rate)}</td>`).join('')}<td class="n">${fmtPct(g.risk.capture)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="caption">현재 입력(임원 ${fmtInt(state.vals.m)}명, 팀장 ${fmtPct(state.vals.k, 0)})과 시나리오 ${scn} 기준입니다. 포착률은 그 집단 퇴사자 중 면담(팀장·임원)에 배정된 비율입니다. 나이·성별은 모델 입력에서 뺐지만, 나이는 생성 규칙에 약하게 넣어 다른 열을 통해 점수에 스며드는지 보도록 설계했습니다. 비율 차이가 곧 차별을 뜻하지는 않지만, 차이가 크면 이유를 확인해야 합니다. 작은 집단은 우연에 따라 크게 흔들립니다.</p>`;
  }

  // F14 신뢰도 곡선
  const cal = D.calibration ?? d.A.calibration;
  const cBody = $('card-calibration').querySelector('.body');
  if (!cal) cBody.innerHTML = notReady('신뢰도 곡선');
  else {
    const mm = d.A.metrics.stage1.methods.find((m) => m.id === cal.model);
    cBody.innerHTML = '<div id="cal-chart"></div>';
    const pts = (arr) => (arr ?? []).slice().sort((a, b) => a.mean_pred - b.mean_pred).map((b) => ({ x: b.mean_pred, y: b.frac_pos, count: b.count }));
    lineChart($('cal-chart'), {
      series: [
        { id: 'raw', label: '보정 전', style: { color: 'var(--s-base)', dash: '6 4', cls: 'dash' }, points: pts(cal.raw) },
        { id: 'cal', label: '보정 후', style: { color: 'var(--s-purple)' }, points: pts(cal.cal) },
      ],
      xDomain: [0, 1], yDomain: [0, 1], dots: true, height: 240,
      refLine: [[0, 0], [1, 1]], refLabel: '완벽한 보정',
      xTickFmt: (x) => fmtN(x, 1), yTickFmt: (y) => fmtN(y, 1),
      xFmt: (x) => `예측 ${fmtN(x, 2)}`, yFmt: (y) => `실제 ${fmtN(y, 2)}`,
      ariaLabel: '확률 보정 전후 신뢰도 곡선',
      axisNote: '가로: 예측 확률 평균(10구간) · 세로: 실제 퇴사 비율',
    });
    cBody.insertAdjacentHTML('beforeend', `<p class="caption">${esc(mm?.label ?? cal.model)} 모델. 점선 대각선에 가까울수록 "확률 0.3이면 실제로 10명 중 3명"에 가깝습니다. Brier 점수(낮을수록 좋음): 보정 전 ${fmtN(mm?.brier_raw)} → 보정 후 ${fmtN(mm?.brier_cal)}.</p>`);
  }

  // F16 민감도 — 시범 인원 n × 궁합 강도 (2026-11-16 21:30 형식)
  const sens = d.sensitivity;
  const sBody = $('card-sensitivity').querySelector('.body');
  if (!sens) sBody.innerHTML = notReady('민감도 분석');
  else if (!Array.isArray(sens.n) || !Array.isArray(sens.cells)) sBody.innerHTML = '<div class="placeholder">민감도 파일 형식이 약속(시범 인원 n × 궁합 강도)과 달라 표시하지 않았습니다.</div>';
  else {
    const reps = sens.repeats ?? 3;
    const cell = (n, st) => sens.cells.find((c) => c.n === n && c.strength === st);
    const stLabel = (st) => (st === 0 ? '0 (균일)' : st === 1 ? '1.0 (시나리오 B)' : String(st));
    const table = (key, title, winsKey) => {
      let t = `<h3 style="font-size:.95rem;margin:12px 0 6px">${esc(title)}</h3><div class="tw"><table style="min-width:440px"><thead><tr><th>시범 인원 n \\ 궁합 강도 s</th>${sens.strength.map((st) => `<th class="n">${esc(stLabel(st))}</th>`).join('')}</tr></thead><tbody>`;
      for (const n of sens.n) {
        t += `<tr><td>${fmtInt(n)}명</td>${sens.strength.map((st) => {
          const c = cell(n, st);
          const r = c?.[key];
          if (!r || r.mean == null) return '<td class="n">—</td>';
          const win = r.mean > 1;
          const wins = winsKey && c[winsKey] != null ? `<br><span class="mu" style="font-weight:400">이긴 횟수 ${c[winsKey]}/${reps}</span>` : '';
          return `<td class="n${win ? ' win' : ''}">×${fmtN(r.mean, 2)}<br><span class="mu" style="font-weight:400">${fmtN(r.min, 2)}~${fmtN(r.max, 2)}</span>${wins}</td>`;
        }).join('')}</tr>`;
      }
      return `${t}</tbody></table></div>`;
    };
    const inp = sens.inputs ?? {};
    sBody.innerHTML = `${table('benefit_ratio', '효과 순 ÷ 위험 순 (순이익 비율)', 'uplift_wins')}${table('expert_ratio', 'HR 전문가 규칙 ÷ 위험 순 (순이익 비율)', null)}
      <p class="caption">칸 = 시드 ${reps}개 평균(위), 최소~최대(아래). 1보다 크면 위험 순보다 순이익이 큽니다(연보라 칸). "이긴 횟수"는 시드 중 효과 순이 위험 순을 이긴 횟수입니다. 시나리오 B 생성 규칙에서 시범 인원과 궁합 강도만 바꿔 다시 생성·학습했습니다(시험 30%, 임원 ${esc(inp.m_rule ?? '시험 인원의 5%')}, 팀장 ${fmtPct(inp.k, 0)}, 대체 비용 ${fmtWon(inp.C_replace)}, 팀장 ${fmtWon(inp.C_lead)}, 임원 ${fmtWon(inp.C_exec)}). 위험 순 순이익이 0 이하인 시드는 비율에서 뺍니다.</p>
      <p class="caption">전문가 규칙 표: ${esc(EXPERT_NOTE)}</p>
      ${sens.note ? `<p class="caption">${esc(sens.note)}</p>` : ''}`;
  }
}

// ---------------------------------------------------------------- F6 요약 문장
function renderSummary() {
  const d = state.data;
  const v = state.vals;
  const btn = $('btn-copy');
  if (!v || !state.last?.all) {
    $('summary-text').value = '입력을 모두 채우면 요약 문장을 만듭니다.';
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  const s1 = d.A.scores.stage1;
  const best = s1.methods.find((m) => m.id === s1.best) ?? s1.methods[s1.methods.length - 1];
  const rnd = s1.methods.find((m) => m.id === 'random');
  const b = stage1TopK(s1.left, best.rank, v);
  const r = rnd ? stage1TopK(s1.left, rnd.rank, v) : null;
  const all = state.last.all;
  const scn = state.scenario;
  const text = [
    `[가상 데이터 시뮬레이션${d.meta.mock ? ' · 견본 데이터' : ''}] 시험 대조군 ${fmtInt(s1.n)}명 중 위험 점수 상위 ${fmtPct(v.k, 0)}(${fmtInt(b.S)}명)를 면담하면, 대표 모델(${best.label})은 면담 안 하면 떠났을 사람 ${fmtInt(b.TP)}명을 찾아 면담 후 재직(예상) ${fmtPpl(b.TP * v.r)}명, 예상 순이익 ${fmtWon(b.net)}${r ? `, 무작위 순서는 ${fmtInt(r.TP)}명·${fmtWon(r.net)}` : ''}입니다.`,
    `2단계 시나리오 ${scn}(${scn === 'A' ? '효과 균일' : '사유 × 권한 궁합'})에서 임원 ${fmtInt(v.m)}명·팀장 ${fmtInt(all.risk.lead)}명을 배분하면 순이익은 위험 순 ${fmtWon(all.risk.net)}, 효과 순 ${fmtWon(all.uplift.net)}${all.uplift.pct != null ? `(최대치 대비 ${all.uplift.pct.toFixed(1)}%)` : ''}${all.expert ? `, HR 전문가 규칙 ${fmtWon(all.expert.net)}(현업 가정 기준선)` : ''}이고, 팀장 면담 역효과 우려는 위험 순 ${fmtInt(all.risk.backfire)}명, 효과 순 ${fmtInt(all.uplift.backfire)}명입니다.`,
    `가정: 대체 비용 ${fmtWon(v.C_replace)}, 팀장 면담 ${fmtWon(v.C_lead)}, 임원 면담 ${fmtWon(v.C_exec)}, 면담 성공률(1단계) ${v.r}. 가정에 따른 시뮬레이션이며 실제 이득을 보장하지 않습니다. 면담 대상 선정용이며 개인 평가에 쓰지 않습니다.`,
  ].join(' ');
  $('summary-text').value = text;
}

async function copySummary() {
  const ta = $('summary-text');
  try {
    await navigator.clipboard.writeText(ta.value);
    $('copy-msg').textContent = '복사했습니다.';
  } catch {
    ta.select();
    $('copy-msg').textContent = '자동 복사가 막혀 있습니다. 선택된 글을 Ctrl+C로 복사해 주십시오.';
  }
}

// ---------------------------------------------------------------- 푸터
function renderFooter() {
  const m = state.data.meta;
  const ver = m.versions ? Object.entries(m.versions).map(([k, v]) => `${k} ${v}`).join(', ') : '—';
  let when = m.generated_at ?? '—';
  const dt = new Date(m.generated_at);
  if (!Number.isNaN(dt.getTime())) when = `${dt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시각)`;
  const rows = [
    ['데이터', m.mock ? '견본 데이터(site/mock/make_mock.mjs)' : '가상 데이터 실행 결과'],
    ['시드', m.seed ?? '—'],
    ['인원', `${fmtInt(m.n)}명${m.split ? ` (훈련 ${fmtInt(m.split.train)} · 시험 ${fmtInt(m.split.test)})` : ''}`],
    ['생성 시각', when],
    ['실행 시간', m.runtime_sec != null ? `${m.runtime_sec}초` : '—'],
    ['버전', ver],
  ];
  $('meta-dl').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

// ---------------------------------------------------------------- 시작
async function main() {
  try {
    state.data = await loadData();
  } catch (err) {
    const box = $('load-error');
    box.hidden = false;
    box.innerHTML = `<h3>데이터를 읽지 못했습니다</h3><p>${esc(err.message)}</p><p class="mu">파일을 직접 열면(file://) 브라우저가 읽기를 막습니다. <code>python -m http.server -d site</code>로 연 주소에서 확인해 주십시오.</p>`;
    for (const id of ['inputs', 'stage1', 'explain1', 'stage2', 'p1']) $(id).hidden = true;
    return;
  }
  const d = state.data;
  $('mock-band').hidden = !d.meta.mock;
  const n2 = d.A.scores.stage2.n;
  $('m-hint').textContent = `시험 전체 ${fmtInt(n2)}명 중 임원이 면담할 비율(%)`;

  for (const f of FIELDS) $(`in-${f}`).addEventListener('input', schedule);
  for (const f of ['k', 'm']) {
    $(`rg-${f}`).addEventListener('input', (e) => { $(`in-${f}`).value = e.target.value; schedule(); });
  }
  $('btn-example').addEventListener('click', () => {
    const ex = exampleValues();
    for (const f of FIELDS) $(`in-${f}`).value = ex[f];
    schedule();
  });
  $('btn-clear').addEventListener('click', () => {
    for (const f of FIELDS) $(`in-${f}`).value = '';
    schedule();
  });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { state.scenario = b.dataset.scn; schedule(); }));
  $('btn-copy').addEventListener('click', copySummary);

  // 빠른 입력 막대: 막대에서 바꾸면 위쪽 입력칸에 넣고 다시 계산한다
  const qbLink = (qid, field) => $(qid).addEventListener('input', (e) => { $(`in-${field}`).value = e.target.value; schedule(); });
  qbLink('qb-k', 'k');
  qbLink('qb-m', 'm');
  qbLink('qb-C_replace', 'C_replace');
  $('qb-all').addEventListener('click', () => $('inputs').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('qb-toggle').addEventListener('click', () => {
    const bar = $('quickbar');
    const collapsed = bar.classList.toggle('collapsed');
    $('qb-toggle').textContent = collapsed ? '펼치기' : '접기';
    $('qb-toggle').setAttribute('aria-expanded', String(!collapsed));
  });
  // 위쪽 입력칸이 화면 위로 지나가면 막대를 보여 주고, 다시 보이면 숨긴다
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => {
      const show = !en.isIntersecting && en.boundingClientRect.top < 0;
      $('quickbar').hidden = !show;
      document.body.classList.toggle('qb-on', show);
    }).observe($('inputs'));
  }

  // 주소 옵션: ?example=1 → 예시값을 채운 상태로 열기, ?scenario=B → 시나리오 B로 열기 (제출 문서 링크·화면 캡처용)
  const qs = new URLSearchParams(location.search);
  if (qs.get('scenario') === 'B') state.scenario = 'B';  // 버튼 눌림 표시는 렌더링에서 맞춘다
  if (qs.has('example')) {
    const ex = exampleValues();
    for (const f of FIELDS) $(`in-${f}`).value = ex[f];
  }

  renderFooter();
  update();
}

main();
