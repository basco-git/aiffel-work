import { useEffect, useState } from 'preact/hooks';
import { CFG } from '../core/data';
import { store } from '../core/store';
import { Hud, Toasts } from './Hud';
import { DebugPanel } from './DebugPanel';
import { EnhancePanel } from './EnhancePanel';
import { EquipPanel, InventoryPanel, NpcPanel, QuestPanel, TowerPanel } from './Panels';
import { Title } from './Title';
import { TouchControls } from './TouchControls';

export function useStore() {
  const [, setV] = useState(0);
  useEffect(() => store.subscribe(() => setV((v) => v + 1)), []);
  return store;
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (store.screen !== 'play' || !store.save) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
        if (e.key === 'Escape') (el as HTMLElement).blur();
        return;
      }
      const k = e.key.toLowerCase();
      const toggle = (p: typeof store.panel) => store.openPanel(store.panel === p ? null : p);
      if (k === 'escape') store.openPanel(null);
      else if (k === 'e') store.interact();
      else if (k === 'i') toggle('inventory');
      else if (k === 'j') toggle('quest');
      else if (k === 'u' && CFG.factions[store.faction].canEquip) toggle('equip');
      else if ((k === 'f1' || k === '`') && CFG.debug.enabled) {
        e.preventDefault();
        toggle('debug');
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const s = useStore();
  useHotkeys();
  if (s.screen === 'loading') return <div class="loading">불러오는 중…</div>;
  if (s.screen === 'title') return <Title />;
  if (!s.save) return null;
  return (
    <>
      <Hud />
      <Toasts />
      {s.touch && <TouchControls />}
      {s.panel === 'npc' && <NpcPanel />}
      {s.panel === 'enhance' && <EnhancePanel />}
      {s.panel === 'equip' && <EquipPanel />}
      {s.panel === 'inventory' && <InventoryPanel />}
      {s.panel === 'quest' && <QuestPanel />}
      {s.panel === 'tower' && <TowerPanel />}
      {s.panel === 'debug' && <DebugPanel />}
    </>
  );
}

export function Modal(props: { title: string; children: preact.ComponentChildren; wide?: boolean }) {
  return (
    <div class="modal-back" onPointerDown={(e) => e.target === e.currentTarget && store.openPanel(null)}>
      <div class={`modal ${props.wide ? 'wide' : ''}`}>
        <div class="modal-head">
          <span>{props.title}</span>
          <button class="close" onClick={() => store.openPanel(null)} aria-label="닫기">
            ✕
          </button>
        </div>
        <div class="modal-body">{props.children}</div>
      </div>
    </div>
  );
}
