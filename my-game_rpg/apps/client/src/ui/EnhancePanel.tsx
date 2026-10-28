import { useState } from 'preact/hooks';
import { GRADES, PART_IDS, breakDropOf, canEnhance, isBreakthrough, stageOf, successRate, targetValue, type PartId } from '@tb/shared';
import { CFG, DATA } from '../core/data';
import { Modal, useStore } from './App';

const E = CFG.enhance;

export function EnhancePanel() {
  const s = useStore();
  const save = s.save!;
  const [part, setPart] = useState<PartId>('head');
  const [flash, setFlash] = useState<{ id: number; ok: boolean } | null>(null);
  const v = save.enhance[part];
  const rate = successRate(v, E);
  const maxed = !canEnhance(v, E);

  const tryEnhance = (g: (typeof GRADES)[number]) => {
    const r = s.enhance(part, g);
    if (r) setFlash({ id: r.id, ok: r.success });
  };

  return (
    <Modal title={s.faction === 'mechanic' ? '부위 개조 — 정비장' : '세포 이식 — 배양실'} wide>
      <div class="enhance">
        <div class="part-list">
          {PART_IDS.map((p) => {
            const pv = save.enhance[p];
            return (
              <button key={p} class={`part-row ${p === part ? 'sel' : ''}`} onClick={() => setPart(p)} data-testid={`part-${p}`}>
                <span class="pname">{s.partName(p)}</span>
                <span class="pval">{pv}</span>
                <span class="pstage">{stageOf(pv, E)}구간</span>
                <span class="prate">{canEnhance(pv, E) ? `${Math.round(successRate(pv, E) * 100)}%` : 'MAX'}</span>
              </button>
            );
          })}
        </div>
        <div class={`part-detail ${flash ? (flash.ok ? 'ok' : 'fail') : ''}`} key={flash?.id}>
          <div class="big">
            {s.partName(part)} <b data-testid="enhance-value">{v}</b>
            <small>
              {' '}
              / {E.maxValue} · {stageOf(v, E)}구간
            </small>
          </div>
          <div class="muted">
            {maxed ? '최대치에 도달해 더 강화할 수 없습니다.' : `현재 성공 확률 ${(rate * 100).toFixed(0)}% · 다음 50 배수 ${(Math.floor(v / E.breakpointEvery) + 1) * E.breakpointEvery}`}
          </div>
          <div class="grade-buttons">
            {GRADES.map((g) => {
              const n = save.materials[part][g];
              const brk = !maxed && isBreakthrough(v, g, E);
              return (
                <button
                  key={g}
                  class="btn grade"
                  style={{ borderColor: DATA.materials.gradeColors[g] }}
                  disabled={!n || maxed}
                  onClick={() => tryEnhance(g)}
                  data-testid={`enhance-${g}`}
                >
                  <span style={{ color: DATA.materials.gradeColors[g] }}>{DATA.materials.gradeNames[g]}</span> ×{n}
                  <small>{maxed ? '' : `→ ${targetValue(v, g, E)}`}</small>
                  {brk && <small class="warn">돌파 · 실패 시 −{breakDropOf(v, E)}</small>}
                </button>
              );
            })}
          </div>
          <div class="log" data-testid="enhance-log">
            {s.enhanceLog.map((r) => (
              <div key={r.id} class={r.success ? 'ok' : 'fail'}>
                {r.success ? '성공' : r.breakthrough ? '돌파 실패' : '실패'} — {s.partName(r.part)} {r.from} → {r.to} ({DATA.materials.gradeNames[r.grade]}, {Math.round(r.rate * 100)}%)
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
