// alloc.js 검사. 실행: node site/alloc.test.mjs [데이터 폴더, 기본 site/data]
// 1) 손으로 계산한 작은 예시(독립 검증)  2) data/reference.json 기대값과 소수 2자리 대조
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  roundHalfEven, countFromRatio, floorCount, stage1TopK, stage1Threshold, stage1Curve,
  stage2Allocate, stage2All, stage2Curve, validateInputs, fairnessTable, availableMethods,
} from './alloc.js';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (a, b, tol = 1e-9) => a != null && b != null && Math.abs(a - b) <= tol;
// 소수 2자리까지 일치: 차이가 0.005 이하(큰 금액의 부동소수 오차 여유 포함)
const same2 = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.005 + Math.abs(b) * 1e-12;
function eq(name, got, want) { check(name, near(got, want), `기대 ${want}, 실제 ${got}`); }

// ---------------------------------------------------------------- 손계산 예시
// 반올림: Python round()와 같은 짝수 쪽 반올림
eq('반올림 2.5 → 2', roundHalfEven(2.5), 2);
eq('반올림 3.5 → 4', roundHalfEven(3.5), 4);
eq('반올림 2.6 → 3', roundHalfEven(2.6), 3);
eq('인원 round(5 × 0.5) = 2', countFromRatio(5, 0.5), 2);
eq('인원 round(1080 × 0.2) = 216', countFromRatio(1080, 0.2), 216);

// 1단계: 5명, 퇴사 = 0번·2번, 순위 = 행 번호 그대로
// k=0.4 → S=2(0·1번), TP=1, 순이익 = 1×0.5×100 − 2×10 = 30
{
  const left = [1, 0, 1, 0, 0];
  const rank = [0, 1, 2, 3, 4];
  const p = { k: 0.4, r: 0.5, C_replace: 100, C_lead: 10 };
  const r = stage1TopK(left, rank, p);
  eq('1단계 S', r.S, 2);
  eq('1단계 TP', r.TP, 1);
  eq('1단계 불필요 면담', r.unneeded, 1);
  eq('1단계 순이익', r.net, 30);
  eq('1단계 포착률', r.capture, 0.5);
  // 문턱: p × 0.5 × 100 > 10 ⇔ p > 0.2 → 0번(0.5)·2번(0.3). 3번(0.2)은 같으므로 제외(엄격한 부등호)
  const t = stage1Threshold(left, [0.5, 0.1, 0.3, 0.2, 0.05], p);
  eq('문턱 S', t.S, 2);
  eq('문턱 TP', t.TP, 2);
  eq('문턱 순이익', t.net, 80);
  check('문턱: prob 없으면 null', stage1Threshold(left, null, p) === null);
  // 곡선: k=0 → 0, k=0.6 → S=3, TP=2 → 2×50 − 30 = 70, k=1 → S=5, TP=2 → 100 − 50 = 50
  const c = stage1Curve(left, rank, p, [0, 0.6, 1]);
  eq('1단계 곡선 k=0', c[0].net, 0);
  eq('1단계 곡선 k=0.6', c[1].net, 70);
  eq('1단계 곡선 k=1', c[2].net, 50);
  // 순위가 행 번호와 다를 때: rank=[4,3,2,1,0] → k=0.4면 4·3번 선정, 퇴사자 없음 → −20
  eq('1단계 역순위 순이익', stage1TopK(left, [4, 3, 2, 1, 0], p).net, -20);
}

// 2단계: 4명. 2진 소수로 맞춰 부동소수 동점을 정확히 만든다.
// C_replace=64, C_lead=1, C_exec=4, m=1, k=0.5 → L=2
const s2 = {
  n: 4,
  left: [1, 0, 1, 0],
  risk: [0.9, 0.3, 0.5, 0.1],
  tau_hat_lead: [0.125, 0.0625, 0.03125, 0],
  tau_hat_exec: [0.125, 0.109375, 0, 0.0625],
  tau_lead: [0.10, -0.05, 0.02, 0.00],
  tau_exec: [0.20, 0.30, 0.01, 0.05],
  tiebreak: [3, 2, 1, 0],
  age_band: ['30대', '30대', '40대', '50세 이상'],
  gender: ['남', '여', '여', '남'],
};
const p2 = { m: 1, k: 0.5, C_replace: 64, C_lead: 1, C_exec: 4 };
{
  const all = stage2All(s2, p2);
  // random: tiebreak 순서 3,2,1,0 → 임원 3번, 팀장 2·1번. 막은 퇴사 0.05+0.02−0.05=0.02, 순이익 1.28−4−2=−4.72, 역효과 1(1번)
  eq('무작위 막은 퇴사', all.random.saved, 0.02);
  eq('무작위 순이익', all.random.net, -4.72);
  eq('무작위 역효과', all.random.backfire, 1);
  // risk: 위험 순 0,2,1,3 → 임원 0번, 팀장 2·1번. 0.20+0.02−0.05=0.17 → 10.88−6=4.88
  eq('위험 순 막은 퇴사', all.risk.saved, 0.17);
  eq('위험 순 순이익', all.risk.net, 4.88);
  eq('위험 순 역효과', all.risk.backfire, 1);
  // uplift: V_lead=[7,3,1,−1], V_exec=[4,3,−4,0], 임원 이득=[−3,0,−5,0] → 1번·3번 동점, tiebreak로 3번이 임원
  // 팀장: 남은 0,1,2 중 V_lead 큰 0·1번. 0.05+0.10−0.05=0.10 → 6.4−6=0.4, 역효과 1
  check('효과 순 동점 처리: 3번이 임원', all.uplift.assign[3] === 2 && all.uplift.assign[1] === 1);
  eq('효과 순 막은 퇴사', all.uplift.saved, 0.10);
  eq('효과 순 순이익', all.uplift.net, 0.4);
  eq('효과 순 역효과', all.uplift.backfire, 1);
  // oracle: V_lead=[5.4,−4.2,0.28,−1], V_exec=[8.8,15.2,−3.36,−0.8], 이득=[3.4,15.2,−3.64,−0.8] → 임원 1번, 팀장 0·2번
  // 0.30+0.10+0.02=0.42 → 26.88−6=20.88, 역효과 0
  eq('상한 막은 퇴사', all.oracle.saved, 0.42);
  eq('상한 순이익', all.oracle.net, 20.88);
  eq('상한 역효과', all.oracle.backfire, 0);
  eq('상한 대비 % (효과 순)', all.uplift.pct, (0.4 / 20.88) * 100);
  eq('상한 대비 % (상한 자신)', all.oracle.pct, 100);
  eq('임원 인원', all.risk.exec, 1);
  eq('팀장 인원', all.risk.lead, 2);

  // m + L > n 은 오류
  let threw = false;
  try { stage2Allocate(s2, 'risk', { ...p2, m: 3 }); } catch (e) { threw = e instanceof RangeError; }
  check('m + L > n 이면 RangeError', threw);

  // 곡선: m=1, k=[0,0.25,0.5,0.75,1] → L=0,1,2,3,4(4는 m+L>n → null)
  // 효과 순 팀장 순서 0,1,2: L=0 → 0.05×64−4=−0.8, L=1 → 0.15×64−5=4.6, L=3 → 0.12×64−7=0.68
  const c = stage2Curve(s2, 'uplift', p2, [0, 0.25, 0.5, 0.75, 1]);
  eq('2단계 곡선 L=0', c[0].net, -0.8);
  eq('2단계 곡선 L=1', c[1].net, 4.6);
  eq('2단계 곡선 L=2 = 단일 계산', c[2].net, all.uplift.net);
  eq('2단계 곡선 L=3', c[3].net, 0.68);
  check('2단계 곡선 m+L>n 은 null', c[4].net === null);

  // 공정성: 위험 순 배정 [2,1,1,0], 효과 순 [1,1,0,2]
  const f = fairnessTable(s2, { risk: all.risk.assign, uplift: all.uplift.assign });
  const g30 = f.find((x) => x.group === '30대');
  eq('공정성 30대 비중', g30.share, 0.5);
  eq('공정성 30대 임원(위험 순)', g30.risk.exec_rate, 0.5);
  eq('공정성 30대 팀장(효과 순)', g30.uplift.lead_rate, 1);
  eq('공정성 30대 포착률(퇴사자 0번이 임원)', g30.risk.capture, 1);
  check('공정성 30세 미만: 인원 0이면 비율 null', f.find((x) => x.group === '30세 미만').risk.exec_rate === null);
}

// HR 전문가 규칙(expert): 위험 순서 0,2,1,3 (risk = [0.9, 0.3, 0.5, 0.1])
{
  check('needs_authority 없으면 expert 제외', !availableMethods(s2).includes('expert'));
  // 예시 1: 권한 필요자가 1번 하나뿐인데 m=2 → 1번 다음, 나머지 중 위험 순서 첫 번째인 0번으로 채움
  // 팀장 L=round(4×0.25)=1 → 남은 2·3번 중 갈등 없는 위험 순서 첫 번째 2번
  // 막은 퇴사 0.30+0.20+0.02=0.52 → 0.52×64 − 2×4 − 1×1 = 24.28
  const e1 = { ...s2, needs_authority: [0, 1, 0, 0], leader_conflict: [0, 0, 0, 0] };
  check('expert 사용 가능', availableMethods(e1).includes('expert'));
  const r1 = stage2Allocate(e1, 'expert', { ...p2, m: 2, k: 0.25 });
  check('expert 예시1 배정(1·0번 임원, 2번 팀장)', r1.assign[1] === 2 && r1.assign[0] === 2 && r1.assign[2] === 1 && r1.assign[3] === 0);
  eq('expert 예시1 막은 퇴사', r1.saved, 0.52);
  eq('expert 예시1 순이익', r1.net, 24.28);
  // 예시 2: 임원 m=1 → 권한 필요자 0번. 팀장 L=round(4×0.75)=3이지만 갈등 있는 1·2번은 제외 → 3번 1명만
  // 막은 퇴사 0.20+0.00=0.20 → 0.20×64 − 4 − 1×1 = 7.8 (팀장 비용은 실제 배정 1명분)
  const e2 = { ...s2, needs_authority: [1, 0, 0, 0], leader_conflict: [0, 1, 1, 0] };
  const r2 = stage2Allocate(e2, 'expert', { ...p2, m: 1, k: 0.75 });
  eq('expert 예시2 팀장 인원(L보다 적음)', r2.lead, 1);
  check('expert 예시2 갈등자 팀장 제외', r2.assign[1] === 0 && r2.assign[2] === 0 && r2.assign[3] === 1);
  eq('expert 예시2 순이익', r2.net, 7.8);
  // 곡선에서도 같은 값
  eq('expert 곡선 = 단일 계산', stage2Curve(e2, 'expert', { ...p2, m: 1 }, [0.75])[0].net, 7.8);
}

// 입력 검사
{
  // 임원 면담은 비율(%)로 받고 인원은 소수점 버림(11-17 변경): 2,700명 × 5% = 135명
  const ok = validateInputs({ C_replace: '3000', C_lead: '30', C_exec: '150', r: '0.3', k: '20', m: '5' }, { n1: 1080, n2: 2700 });
  check('입력 정상', ok.ok && ok.values.C_replace === 30000000 && ok.values.k === 0.2 && ok.values.m === 135 && ok.values.mPct === 5);
  const empty = validateInputs({ C_replace: '', C_lead: '', C_exec: '', r: '', k: '', m: '' }, { n1: 1080, n2: 2700 });
  check('빈 입력은 오류', !empty.ok && Object.keys(empty.errors).length === 6);
  const over = validateInputs({ C_replace: '3000', C_lead: '30', C_exec: '150', r: '0.3', k: '99', m: '5' }, { n1: 1080, n2: 2700 });
  check('m + L > n 안내', !over.ok && /많습니다/.test(over.errors.m));
  const badR = validateInputs({ C_replace: '3000', C_lead: '30', C_exec: '150', r: '1.5', k: '20', m: '150' }, { n1: 1080, n2: 2700 });
  check('r 범위·m 비율 범위 검사', !badR.ok && badR.errors.r && badR.errors.m);
  // 소수점 버림: 4.99% → 134.73명 → 134명, 0.04% → 1.08명 → 1명, 7.3% → 197.1명 → 197명
  const fl = (p) => validateInputs({ C_replace: '3000', C_lead: '30', C_exec: '150', r: '0.3', k: '20', m: p }, { n1: 1080, n2: 2700 }).values.m;
  check('임원 인원 소수점 버림', fl('4.99') === 134 && fl('0.04') === 1 && fl('7.3') === 197 && fl('5') === 135 && fl('0') === 0);
  check('floorCount 부동소수 오차 방지', floorCount(2700, 5) === 135 && floorCount(100, 7) === 7 && floorCount(3, 33.3333) === 0);
}

// ---------------------------------------------------------------- reference.json 대조
const dataDir = process.argv[2] ? process.argv[2] : join(here, 'data');
const refPath = join(dataDir, 'reference.json');
let refCount = 0;
if (!existsSync(refPath)) {
  fails.push('data/reference.json 없음');
} else {
  const ref = JSON.parse(readFileSync(refPath, 'utf8'));
  const scoresCache = {};
  const scores = (scn) => (scoresCache[scn] ??= JSON.parse(readFileSync(join(dataDir, scn, 'scores.json'), 'utf8')));
  ref.cases.forEach((c, ci) => {
    const sc = scores(c.scenario);
    const tag = `참조#${ci}(${c.scenario}, k=${c.inputs.k}, m=${c.inputs.m})`;
    for (const [id, want] of Object.entries(c.stage1 ?? {})) {
      const m = sc.stage1.methods.find((x) => x.id === id);
      if (!m) { fails.push(`${tag} 1단계 방법 없음: ${id}`); continue; }
      const got = stage1TopK(sc.stage1.left, m.rank, c.inputs);
      for (const key of Object.keys(want)) {
        if (key === 'threshold') {
          // 기대이익 문턱: prob가 있는 방법만
          const thr = stage1Threshold(sc.stage1.left, m.prob, c.inputs);
          if (!thr) { fails.push(`${tag} 1단계 ${id}.threshold: prob 없음`); continue; }
          for (const tk of Object.keys(want.threshold)) {
            check(`${tag} 1단계 ${id}.threshold.${tk}`, same2(thr[tk], want.threshold[tk]), `기대 ${want.threshold[tk]}, 실제 ${thr[tk]}`);
            refCount++;
          }
          continue;
        }
        // capture처럼 6자리로 반올림해 저장된 비율은 소수 2자리 비교로 충분하다
        check(`${tag} 1단계 ${id}.${key}`, same2(got[key], want[key]), `기대 ${want[key]}, 실제 ${got[key]}`);
        refCount++;
      }
    }
    const all = stage2All(sc.stage2, c.inputs, Object.keys(c.stage2 ?? {}).includes('oracle') ? undefined : Object.keys(c.stage2 ?? {}));
    for (const [id, want] of Object.entries(c.stage2 ?? {})) {
      const got = all[id];
      if (!got) { fails.push(`${tag} 2단계 방법 없음: ${id}`); continue; }
      for (const key of Object.keys(want)) {
        check(`${tag} 2단계 ${id}.${key}`, same2(got[key], want[key]), `기대 ${want[key]}, 실제 ${got[key]}`);
        refCount++;
      }
    }
  });
}

console.log(`데이터: ${dataDir}`);
console.log(`통과 ${pass}개 / 실패 ${fails.length}개 (그중 reference.json 대조 ${refCount}개)`);
if (fails.length) {
  for (const f of fails) console.log(`  실패: ${f}`);
  process.exit(1);
}
