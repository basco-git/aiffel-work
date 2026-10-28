import { GRADES, PART_IDS } from '@tb/shared';
import { CFG, DATA } from '../core/data';
import { store } from '../core/store';
import { Modal, useStore } from './App';

const MISSION_LABEL = { hunt: '사냥형', maze: '미궁형', quest: '퀘스트형', boss: '보스전' } as const;

export function NpcPanel() {
  const s = useStore();
  const npc = DATA.quests[s.faction].npc;
  const st = s.questStatus();
  return (
    <Modal title={npc.name}>
      <p class="dialog" data-testid="npc-dialog">
        {s.dialog ?? (st && !st.accepted ? st.quest.start : npc.greeting)}
      </p>
      {st && (
        <div class="quest-box">
          <div class="qtitle">
            [{s.save!.quest.index + 1}/{s.questList.length}] {st.quest.title}
          </div>
          <div>{st.quest.desc}</div>
          {st.accepted && (
            <div class="progress">
              진행: {st.current} / {st.goal}
            </div>
          )}
          <Rewards q={st.quest} />
        </div>
      )}
      <div class="row">
        {st && !st.accepted && (
          <button class="btn primary" onClick={() => s.questAccept()} data-testid="quest-accept">
            퀘스트 수락
          </button>
        )}
        {st?.complete && (
          <button class="btn primary" onClick={() => s.questTurnIn()} data-testid="quest-turnin">
            보고하고 보상 받기
          </button>
        )}
        <button class="btn" onClick={() => s.openPanel('enhance')} data-testid="open-enhance">
          {s.faction === 'mechanic' ? '부위 개조 (강화)' : '세포 이식 (강화)'}
        </button>
      </div>
    </Modal>
  );
}

function Rewards({ q }: { q: NonNullable<ReturnType<typeof store.questStatus>>['quest'] }) {
  const items = CFG.factions[store.faction].canEquip ? q.rewards.items : [];
  return (
    <div class="rewards">
      보상:{' '}
      {q.rewards.materials.map((m) => (
        <span key={m.part + m.grade} style={{ color: DATA.materials.gradeColors[m.grade] }}>
          {store.materialName(m.part, m.grade)} ×{m.count}{' '}
        </span>
      ))}
      {items.map((id) => (
        <span key={id} class="item-name">
          {DATA.equipment.get(id)!.name}{' '}
        </span>
      ))}
    </div>
  );
}

export function QuestPanel() {
  const s = useStore();
  const save = s.save!;
  const st = s.questStatus();
  return (
    <Modal title="퀘스트">
      {st ? (
        <div class="quest-box">
          <div class="qtitle">{st.quest.title}</div>
          <div>{st.quest.desc}</div>
          <div class="progress">
            {st.accepted ? `진행: ${st.current} / ${st.goal}${st.complete ? ' — 완료! 거점 NPC에게 보고하세요' : ''}` : '거점 NPC에게 말을 걸어 수락하세요'}
          </div>
          <Rewards q={st.quest} />
        </div>
      ) : (
        <p>모든 메인 퀘스트를 완료했습니다.</p>
      )}
      <ol class="quest-list">
        {s.questList.map((q, i) => (
          <li key={q.id} class={i < save.quest.index ? 'done' : i === save.quest.index ? 'now' : ''}>
            {i < save.quest.index ? '✓ ' : ''}
            {q.title}
          </li>
        ))}
      </ol>
    </Modal>
  );
}

export function StatsBlock() {
  const st = store.stats;
  return (
    <div class="stats">
      <span>최대 체력 {st.maxHp}</span>
      <span>공격력 {st.atk}</span>
      <span>방어력 {st.def}</span>
      <span>치명타 {(st.crit * 100).toFixed(1)}%</span>
      <span>이동 {st.moveSpeed.toFixed(2)}</span>
      <span>공격 간격 {st.attackInterval.toFixed(2)}초</span>
    </div>
  );
}

export function InventoryPanel() {
  const s = useStore();
  const save = s.save!;
  const canEquip = CFG.factions[s.faction].canEquip;
  return (
    <Modal title={`인벤토리 — ${CFG.factions[s.faction].material}`} wide>
      <StatsBlock />
      <table class="mat-table" data-testid="materials">
        <thead>
          <tr>
            <th>부위</th>
            {GRADES.map((g) => (
              <th key={g} style={{ color: DATA.materials.gradeColors[g] }}>
                {DATA.materials.gradeNames[g]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PART_IDS.map((p) => (
            <tr key={p}>
              <td>{s.partName(p)}</td>
              {GRADES.map((g) => (
                <td key={g} class={save.materials[p][g] ? '' : 'zero'}>
                  {save.materials[p][g]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {canEquip && (
        <>
          <h4>장비 ({save.items.length})</h4>
          <div class="item-list">
            {save.items.length === 0 && <span class="muted">없음</span>}
            {save.items.map((it) => {
              const d = DATA.equipment.get(it.id)!;
              const on = save.equipped.weapon === it.uid || save.equipped.armor === it.uid;
              return (
                <span key={it.uid} class={`chip ${on ? 'on' : ''}`}>
                  {d.name} {d.atk ? `공+${d.atk}` : `방+${d.def}`}
                </span>
              );
            })}
          </div>
        </>
      )}
      <p class="muted">처치 {save.stats.kills} · 사망 {save.stats.deaths} · 강화 시도 {save.stats.enhanceTries}</p>
    </Modal>
  );
}

export function EquipPanel() {
  const s = useStore();
  const save = s.save!;
  const slots = [
    { slot: 'weapon' as const, label: '무기', part: 'weapon' as const },
    { slot: 'armor' as const, label: '방어구', part: 'guard' as const },
  ];
  return (
    <Modal title="장비" wide>
      <StatsBlock />
      {slots.map(({ slot, label, part }) => {
        const uid = save.equipped[slot];
        const cur = save.items.find((i) => i.uid === uid);
        const curDef = cur && DATA.equipment.get(cur.id);
        const list = save.items.filter((i) => DATA.equipment.get(i.id)?.slot === slot);
        return (
          <div key={slot} class="equip-slot">
            <div class="slot-head">
              <b>{label}</b> — 슬롯 강화 {save.enhance[part]} ({s.partName(part)})
              <span class="cur">
                {curDef ? `장착: ${curDef.name} (${slot === 'weapon' ? `공+${curDef.atk}` : `방+${curDef.def}`})` : '비어 있음'}
              </span>
              {curDef && (
                <button class="btn sm" onClick={() => s.unequip(slot)}>
                  해제
                </button>
              )}
            </div>
            <div class="item-list">
              {list.length === 0 && <span class="muted">보유한 {label} 없음</span>}
              {list.map((it) => {
                const d = DATA.equipment.get(it.id)!;
                return (
                  <button key={it.uid} class={`chip ${it.uid === uid ? 'on' : ''}`} onClick={() => s.equip(it.uid)} data-testid={`equip-${it.id}`}>
                    {d.name} {slot === 'weapon' ? `공+${d.atk}` : `방+${d.def}`}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

export function TowerPanel() {
  const s = useStore();
  const cleared = s.save!.tower.highestCleared;
  return (
    <Modal title="탑 — 층 선택">
      <p class="muted">클리어한 층의 다음 층까지 입장할 수 있습니다. 탑 안에서 쓰러져도 강화 수치는 줄지 않습니다.</p>
      <div class="floor-list">
        {DATA.tower.floors.map((f) => {
          const open = f.floor <= cleared + 1;
          return (
            <button
              key={f.floor}
              class={`floor ${f.floor <= cleared ? 'cleared' : ''}`}
              disabled={!open}
              data-testid={`floor-${f.floor}`}
              onClick={() => {
                s.openPanel(null);
                s.command({ type: 'enterFloor', floor: f.floor });
              }}
            >
              <b>{f.floor}층</b> {f.theme}
              <span>
                {MISSION_LABEL[f.mission.type]} · {f.manager.name}
                {f.floor <= cleared ? ' ✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
