import type { PartId, QuestDef } from '../schema';
import { PART_IDS } from '../schema';

export type QuestEvent =
  | { type: 'kill'; monster: string }
  | { type: 'collect'; part: PartId; count: number }
  | { type: 'explore'; point: string };

export interface QuestStateView {
  enhance: Record<PartId, number>;
  highestCleared: number;
}

/** 이벤트형 퀘스트(처치·수집·탐색)의 진행도를 갱신한다. */
export function applyQuestEvent(q: QuestDef, progress: number, ev: QuestEvent): number {
  if (q.type === 'kill' && ev.type === 'kill' && ev.monster === q.target) return Math.min(q.count, progress + 1);
  if (q.type === 'collect' && ev.type === 'collect' && ev.part === q.part) return Math.min(q.count, progress + ev.count);
  if (q.type === 'explore' && ev.type === 'explore' && ev.point === q.point) return 1;
  return progress;
}

/** 현재 진행도와 목표치. 상태형 퀘스트(강화·탑)는 상태에서 계산한다. */
export function questProgress(q: QuestDef, progress: number, s: QuestStateView): { current: number; goal: number } {
  switch (q.type) {
    case 'kill':
    case 'collect':
      return { current: progress, goal: q.count };
    case 'explore':
      return { current: progress, goal: 1 };
    case 'enhance': {
      const values = PART_IDS.map((p) => s.enhance[p]);
      if (q.part === 'any') return { current: Math.min(q.value, Math.max(...values)), goal: q.value };
      if (q.part === 'all') return { current: values.filter((v) => v >= q.value).length, goal: PART_IDS.length };
      return { current: Math.min(q.value, s.enhance[q.part]), goal: q.value };
    }
    case 'tower':
      return { current: Math.min(q.floor, s.highestCleared), goal: q.floor };
  }
}

export function isQuestComplete(q: QuestDef, progress: number, s: QuestStateView): boolean {
  const { current, goal } = questProgress(q, progress, s);
  return current >= goal;
}
