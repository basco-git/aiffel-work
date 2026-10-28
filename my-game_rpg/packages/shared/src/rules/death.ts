import type { Config, PartId } from '../schema';
import { PART_IDS } from '../schema';

type Enhance = Record<PartId, number>;

/** 지역 오염 농도(0~1)에 비례한 감소율 (1%~5%). */
export function penaltyPct(contamination: number, cfg: Config['deathPenalty']): number {
  const c = Math.min(1, Math.max(0, contamination));
  return cfg.minPct + (cfg.maxPct - cfg.minPct) * c;
}

/** 감소량: 올림, 수치가 1 이상이면 최소 1. */
export function penaltyAmount(value: number, pct: number): number {
  if (value <= 0) return 0;
  return Math.min(value, Math.max(1, Math.ceil(value * pct - 1e-9)));
}

export interface DeathPenaltyResult {
  part: PartId;
  from: number;
  to: number;
  pct: number;
}

/**
 * 오염 지역 사망 페널티. 6개 부위 중 무작위 1곳의 강화 수치를 깎는다.
 * @param roll 0 이상 1 미만의 난수 (부위 선택용)
 */
export function applyDeathPenalty(
  enhance: Enhance,
  contamination: number,
  roll: number,
  cfg: Config['deathPenalty'],
): DeathPenaltyResult {
  const part = PART_IDS[Math.min(PART_IDS.length - 1, Math.floor(roll * PART_IDS.length))]!;
  const pct = penaltyPct(contamination, cfg);
  const from = enhance[part];
  const to = from - penaltyAmount(from, pct);
  return { part, from, to, pct };
}
