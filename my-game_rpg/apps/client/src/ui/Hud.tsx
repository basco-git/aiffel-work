import { CFG, DATA } from '../core/data';
import { store } from '../core/store';
import { useStore } from './App';

export function questLine(): string | null {
  const st = store.questStatus();
  if (!st) return '모든 메인 퀘스트 완료';
  if (!st.accepted) return `새 퀘스트: 거점의 ${DATA.quests[store.faction].npc.name}에게 말을 거세요`;
  if (st.complete) return `${st.quest.title} — 완료! 거점 NPC에게 보고`;
  return `${st.quest.title}: ${st.quest.desc.replace(/\s*\(.*\)$/, '')} (${st.current}/${st.goal})`;
}

export function Hud() {
  const s = useStore();
  const rt = s.rt;
  const max = s.stats.maxHp;
  const region = DATA.world.regions.find((r) => r.id === rt.regionId);
  const contamination = rt.location === 'world' && region?.kind === 'field' ? ` · 오염 ${Math.round(region.contamination * 100)}%` : '';
  const place = rt.location === 'tower' ? `탑 ${rt.floor}층` : rt.regionName || '—';
  return (
    <>
      <div class="hud">
        <div class="hud-left">
          <div class="hp">
            <div class="hp-fill" style={{ width: `${(rt.hp / max) * 100}%` }} />
            <span>
              HP {rt.hp} / {max}
            </span>
          </div>
          <div class="hud-tags">
            <span class={`tag ${s.faction}`}>{CFG.factions[s.faction].name}</span>
            <span class={`tag ${rt.safe ? 'safe' : 'danger'}`} data-testid="region">
              {place}
              {rt.safe ? ' · 안전지대' : contamination}
            </span>
          </div>
          {rt.mission ? (
            <div class="quest-line mission" data-testid="mission">
              <b>{rt.mission.title}</b> {rt.mission.detail}
              {rt.mission.timer !== undefined && <span class="timer"> ⏱ {Math.ceil(rt.mission.timer)}초</span>}
              <button class="btn sm leave" onClick={() => s.command({ type: 'leaveTower' })} data-testid="leave-tower">
                나가기
              </button>
            </div>
          ) : null}
          <div class="quest-line" data-testid="quest-line" onClick={() => s.openPanel('quest')}>
            {questLine()}
          </div>
        </div>
        <div class="hud-right">
          <button class="btn sm" onClick={() => s.openPanel('inventory')}>
            인벤토리<kbd>I</kbd>
          </button>
          <button class="btn sm" onClick={() => s.openPanel('quest')}>
            퀘스트<kbd>J</kbd>
          </button>
          {CFG.factions[s.faction].canEquip && (
            <button class="btn sm" onClick={() => s.openPanel('equip')}>
              장비<kbd>U</kbd>
            </button>
          )}
          {CFG.debug.enabled && CFG.debug.showButton && (
            <button class="btn sm debug" onClick={() => s.openPanel('debug')} data-testid="debug-btn">
              디버그<kbd>F1</kbd>
            </button>
          )}
        </div>
      </div>
      {rt.interact && !s.panel && (
        <button class="interact" onClick={() => s.interact()} data-testid="interact">
          {!s.touch && <kbd>E</kbd>} {rt.interact.label}
        </button>
      )}
    </>
  );
}

export function Toasts() {
  const s = useStore();
  return (
    <div class="toasts">
      {s.toasts.map((t) => (
        <div key={t.id} class="toast" style={{ color: t.color }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
