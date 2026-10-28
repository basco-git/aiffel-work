import type { Faction, Grade, PartId } from '../schema';
import { GRADES, PART_IDS } from '../schema';

export const SAVE_VERSION = 1;

export interface ItemInstance {
  uid: string;
  id: string;
}

export interface SaveData {
  version: number;
  faction: Faction;
  enhance: Record<PartId, number>;
  materials: Record<PartId, Record<Grade, number>>;
  items: ItemInstance[];
  equipped: { weapon?: string; armor?: string };
  quest: {
    /** 현재 퀘스트 번호 (퀘스트 수와 같으면 전부 완료) */
    index: number;
    /** 수락 여부 */
    accepted: boolean;
    progress: number;
  };
  tower: { highestCleared: number };
  position: { x: number; y: number };
  stats: { kills: number; deaths: number; enhanceTries: number };
  nextUid: number;
}

export function emptyMaterials(): Record<PartId, Record<Grade, number>> {
  const out = {} as Record<PartId, Record<Grade, number>>;
  for (const p of PART_IDS) {
    out[p] = {} as Record<Grade, number>;
    for (const g of GRADES) out[p][g] = 0;
  }
  return out;
}

export function newSave(faction: Faction, spawn: { x: number; y: number }): SaveData {
  const enhance = {} as Record<PartId, number>;
  for (const p of PART_IDS) enhance[p] = 0;
  return {
    version: SAVE_VERSION,
    faction,
    enhance,
    materials: emptyMaterials(),
    items: [],
    equipped: {},
    quest: { index: 0, accepted: false, progress: 0 },
    tower: { highestCleared: 0 },
    position: { ...spawn },
    stats: { kills: 0, deaths: 0, enhanceTries: 0 },
    nextUid: 1,
  };
}

/**
 * 저장된 데이터를 현재 버전 형식으로 맞춘다. 알 수 없는 형식이면 null.
 * 버전이 올라가면 여기에 단계별 변환을 추가한다.
 */
export function migrateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SaveData>;
  if (s.faction !== 'mechanic' && s.faction !== 'genetic') return null;
  if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return null;
  const base = newSave(s.faction, s.position ?? { x: 0, y: 0 });
  const materials = emptyMaterials();
  for (const p of PART_IDS) for (const g of GRADES) materials[p][g] = s.materials?.[p]?.[g] ?? 0;
  return {
    ...base,
    ...s,
    version: SAVE_VERSION,
    enhance: { ...base.enhance, ...s.enhance },
    materials,
    quest: { ...base.quest, ...s.quest },
    tower: { ...base.tower, ...s.tower },
    stats: { ...base.stats, ...s.stats },
  };
}
