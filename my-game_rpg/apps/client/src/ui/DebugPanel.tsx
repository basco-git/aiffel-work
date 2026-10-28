import { useState } from 'preact/hooks';
import { PART_IDS, type PartId } from '@tb/shared';
import { CFG, DATA } from '../core/data';
import { Modal, useStore } from './App';

const TELEPORTS = [
  { label: '내 거점', at: (f: 'mechanic' | 'genetic') => DATA.world.respawn[f] },
  { label: '정글 입구', at: () => ({ x: 24, y: 30 }) },
  { label: '거대꽃 둥지', at: () => ({ x: 44, y: 49 }) },
  { label: '탑 입구', at: () => ({ x: 61, y: 31.5 }) },
  { label: '해협', at: () => ({ x: 72, y: 30 }) },
  { label: '상어 서식지', at: () => ({ x: 88, y: 30 }) },
];

export function DebugPanel() {
  const s = useStore();
  const g = CFG.debug.grantMaterials;
  const [part, setPart] = useState<PartId | 'all'>('all');
  const [value, setValue] = useState(20);
  const [floor, setFloor] = useState(DATA.tower.floors.length);
  const parts = g.parts === 'all' ? '전 부위' : g.parts.map((p) => s.partName(p)).join(', ');
  const grades = g.grades.map((x) => DATA.materials.gradeNames[x]).join('·');

  return (
    <Modal title="디버그 (테스트용)" wide>
      <div class="debug-grid">
        <section>
          <h4>재료 지급</h4>
          <p class="muted">
            config.json → debug.grantMaterials: {parts} × {grades} × {g.amount}개
          </p>
          <button class="btn primary" onClick={() => s.debugGrantMaterials()} data-testid="debug-grant">
            재료 지급
          </button>
          {CFG.debug.grantEquipment && CFG.factions[s.faction].canEquip && (
            <button class="btn" onClick={() => s.debugGrantEquipment()}>
              장비 전 종류 지급
            </button>
          )}
        </section>
        <section>
          <h4>강화 수치 설정</h4>
          <div class="row">
            <select value={part} onChange={(e) => setPart((e.target as HTMLSelectElement).value as PartId | 'all')}>
              <option value="all">전 부위</option>
              {PART_IDS.map((p) => (
                <option key={p} value={p}>
                  {s.partName(p)}
                </option>
              ))}
            </select>
            <input type="number" min={0} max={CFG.enhance.maxValue} value={value} onInput={(e) => setValue(Number((e.target as HTMLInputElement).value))} />
            <button class="btn" onClick={() => s.debugSetEnhance(part, value)} data-testid="debug-set-enhance">
              적용
            </button>
          </div>
        </section>
        <section>
          <h4>탑 층 해금</h4>
          <div class="row">
            <input type="number" min={0} max={DATA.tower.floors.length} value={floor} onInput={(e) => setFloor(Number((e.target as HTMLInputElement).value))} />
            <span>층까지 클리어 처리</span>
            <button class="btn" onClick={() => s.debugUnlockFloor(floor)}>
              적용
            </button>
          </div>
        </section>
        <section>
          <h4>퀘스트</h4>
          <p class="muted">현재: {s.currentQuest?.title ?? '없음'}</p>
          <button class="btn" onClick={() => s.debugSkipQuest()} disabled={!s.currentQuest} data-testid="debug-skip-quest">
            퀘스트 건너뛰기 (보상 지급)
          </button>
        </section>
        <section>
          <h4>이동·상태</h4>
          <div class="row wrap">
            {s.rt.location === 'world' &&
              TELEPORTS.map((t) => (
                <button
                  key={t.label}
                  class="btn sm"
                  onClick={() => {
                    const p = t.at(s.faction);
                    s.command({ type: 'teleport', x: p.x, y: p.y });
                  }}
                >
                  {t.label}
                </button>
              ))}
            <button class="btn sm" onClick={() => s.command({ type: 'heal' })}>
              체력 회복
            </button>
            <button class="btn sm" onClick={() => s.command({ type: 'killAll' })}>
              주변 적 처치
            </button>
          </div>
        </section>
        <section>
          <h4>초기화</h4>
          <button
            class="btn danger"
            onClick={() => {
              if (confirm('세이브를 삭제하고 타이틀로 돌아갑니다.')) void s.resetAll();
            }}
          >
            세이브 삭제 · 새로 시작하기
          </button>
        </section>
      </div>
    </Modal>
  );
}
