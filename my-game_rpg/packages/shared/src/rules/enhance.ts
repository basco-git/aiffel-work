import type { Config, Grade } from '../schema';

type EnhanceConfig = Config['enhance'];

/** 강화 수치로부터 레벨 구간을 구한다 (0~19 = 0구간). */
export function stageOf(value: number, cfg: EnhanceConfig): number {
  return Math.floor(value / cfg.pointsPerStage);
}

function bandOf(value: number, cfg: EnhanceConfig) {
  const stage = stageOf(value, cfg);
  let band = cfg.bands[0]!;
  for (const b of cfg.bands) if (stage >= b.fromStage) band = b;
  return band;
}

export function canEnhance(value: number, cfg: EnhanceConfig): boolean {
  return value < cfg.maxValue;
}

/** 보너스 배율을 적용한 현재 성공 확률. 최대치에 도달하면 0. */
export function successRate(value: number, cfg: EnhanceConfig, bonusMultiplier = cfg.rateBonusMultiplier): number {
  if (!canEnhance(value, cfg)) return 0;
  return Math.min(cfg.rateCap, bandOf(value, cfg).rate * bonusMultiplier);
}

/** 성공 시 도달할 수치. 50의 배수를 건너뛸 수 없으므로 다음 배수에서 멈춘다. */
export function targetValue(value: number, grade: Grade, cfg: EnhanceConfig): number {
  const nextBreakpoint = (Math.floor(value / cfg.breakpointEvery) + 1) * cfg.breakpointEvery;
  return Math.min(value + cfg.gain[grade], nextBreakpoint, cfg.maxValue);
}

/** 성공하면 50의 배수에 도달하는 시도는 모두 돌파 시도다. */
export function isBreakthrough(value: number, grade: Grade, cfg: EnhanceConfig): boolean {
  return targetValue(value, grade, cfg) % cfg.breakpointEvery === 0;
}

/** 돌파 실패 시 하락 폭 (현재 수치의 구간 기준). */
export function breakDropOf(value: number, cfg: EnhanceConfig): number {
  return bandOf(value, cfg).breakDrop;
}

export interface EnhanceResult {
  success: boolean;
  breakthrough: boolean;
  from: number;
  to: number;
  rate: number;
}

/**
 * 강화 1회를 시도한다. 재료 소모는 호출하는 쪽에서 처리한다.
 * @param roll 0 이상 1 미만의 난수
 */
export function attemptEnhance(
  value: number,
  grade: Grade,
  roll: number,
  cfg: EnhanceConfig,
  bonusMultiplier = cfg.rateBonusMultiplier,
): EnhanceResult {
  if (!canEnhance(value, cfg)) throw new Error('최대 강화 수치에 도달해 강화할 수 없습니다.');
  const rate = successRate(value, cfg, bonusMultiplier);
  const breakthrough = isBreakthrough(value, grade, cfg);
  if (roll < rate) return { success: true, breakthrough, from: value, to: targetValue(value, grade, cfg), rate };
  const to = breakthrough ? Math.max(0, value - breakDropOf(value, cfg)) : value;
  return { success: false, breakthrough, from: value, to, rate };
}
