import type { DropsData, Faction, Grade, PartId } from '../schema';
import { GRADES, PART_IDS } from '../schema';

export type Rng = () => number;

export interface MaterialDrop {
  part: PartId;
  grade: Grade;
  count: number;
}

export interface DropResult {
  materials: MaterialDrop[];
  items: string[];
}

export interface DropSource {
  /** small | medium | large | manager | boss */
  tier: string;
  /** jungle | strait | tower */
  area: string;
  primaryPart: PartId | 'all';
}

function pickWeighted(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function rollGrade(src: DropSource, drops: DropsData, rng: Rng): Grade {
  const area = drops.gradeWeights[src.area] ?? drops.gradeWeights['jungle']!;
  const w = area[src.tier] ?? area['small'] ?? [1, 0, 0, 0];
  return GRADES[pickWeighted(w, rng)]!;
}

export function rollPart(src: DropSource, drops: DropsData, rng: Rng): PartId {
  if (src.primaryPart !== 'all' && rng() < drops.primaryPartChance) return src.primaryPart;
  return PART_IDS[Math.floor(rng() * PART_IDS.length)]!;
}

/** 처치 보상. 장비는 장착 가능한 세력(메카닉)에게만 떨어진다. */
export function rollDrops(src: DropSource, faction: Faction, canEquip: boolean, drops: DropsData, rng: Rng): DropResult {
  const materials: MaterialDrop[] = [];
  const items: string[] = [];
  const chance = drops.dropChance[src.tier] ?? 0;
  const count = drops.dropCount[src.tier] ?? 0;
  for (let i = 0; i < count; i++) {
    if (rng() >= chance) continue;
    const part = rollPart(src, drops, rng);
    const grade = rollGrade(src, drops, rng);
    const same = materials.find((m) => m.part === part && m.grade === grade);
    if (same) same.count++;
    else materials.push({ part, grade, count: 1 });
  }
  if (canEquip && faction === 'mechanic') {
    const eqChance = drops.equipmentChance[src.tier] ?? 0;
    const pool = drops.equipmentPool[src.area] ?? [];
    if (pool.length && rng() < eqChance) items.push(pool[Math.floor(rng() * pool.length)]!);
  }
  return { materials, items };
}
