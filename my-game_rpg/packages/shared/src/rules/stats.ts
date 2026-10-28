import type { Config, EquipmentDef, Faction, PartId, PartsData } from '../schema';
import { PART_IDS } from '../schema';

export interface PlayerStats {
  maxHp: number;
  atk: number;
  def: number;
  crit: number;
  /** 타일/초 */
  moveSpeed: number;
  /** 초 */
  attackInterval: number;
}

export function computeStats(
  faction: Faction,
  enhance: Record<PartId, number>,
  equipped: EquipmentDef[],
  config: Config,
  parts: PartsData,
): PlayerStats {
  const p = config.player;
  const f = config.factions[faction];
  let maxHp = p.baseHp;
  let atk = p.baseAtk;
  let def = p.baseDef;
  let crit = p.baseCrit;
  let moveSpeedPct = 0;
  let attackSpeedPct = 0;

  for (const part of PART_IDS) {
    const per = parts.statsPerPoint[faction][part];
    const v = enhance[part];
    maxHp += (per.maxHp ?? 0) * v;
    atk += (per.atk ?? 0) * v;
    def += (per.def ?? 0) * v;
    crit += (per.crit ?? 0) * v;
    moveSpeedPct += (per.moveSpeedPct ?? 0) * v;
    attackSpeedPct += (per.attackSpeedPct ?? 0) * v;
  }
  if (f.canEquip) {
    for (const item of equipped) {
      atk += item.atk;
      def += item.def;
    }
  }
  return {
    maxHp: Math.round(maxHp),
    atk: Math.round(atk * f.damageMultiplier * 10) / 10,
    def: Math.round(def * 10) / 10,
    crit: Math.min(1, crit),
    moveSpeed: p.baseMoveSpeed * (1 + moveSpeedPct),
    attackInterval: f.attackInterval / (1 + attackSpeedPct),
  };
}

/** 방어력 감쇠: atk × K / (K + def), 최소 1. */
export function calcDamage(atk: number, def: number, isCrit: boolean, config: Config): number {
  const k = config.combat.defenseConstant;
  const base = (atk * k) / (k + Math.max(0, def));
  return Math.max(1, Math.round(base * (isCrit ? config.player.critMultiplier : 1)));
}
