import { useRef, useState } from 'preact/hooks';
import { input } from '../core/input';
import { store } from '../core/store';

const RADIUS = 48;

/** 모바일: 왼쪽 가상 조이스틱 + 오른쪽 공격 버튼 */
export function TouchControls() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);

  const move = (e: PointerEvent) => {
    const o = origin.current;
    if (!o || e.pointerId !== o.id) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    input.stickX = dx / RADIUS;
    input.stickY = dy / RADIUS;
    setKnob({ x: dx, y: dy });
  };
  const end = (e: PointerEvent) => {
    if (origin.current && e.pointerId !== origin.current.id) return;
    origin.current = null;
    input.stickX = 0;
    input.stickY = 0;
    setKnob({ x: 0, y: 0 });
  };

  return (
    <>
      <div
        class="stick"
        onPointerDown={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div class="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        class="attack-btn"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          input.attackHeld = true;
        }}
        onPointerUp={() => (input.attackHeld = false)}
        onPointerCancel={() => (input.attackHeld = false)}
      >
        공격
      </button>
      {store.rt.interact && (
        <button class="use-btn" onClick={() => store.interact()}>
          {store.rt.interact.kind === 'npc' ? '대화' : store.rt.interact.kind === 'tower' ? '입장' : '나가기'}
        </button>
      )}
    </>
  );
}
