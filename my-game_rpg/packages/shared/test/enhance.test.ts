import { describe, expect, it } from 'vitest';
import {
  attemptEnhance,
  breakDropOf,
  canEnhance,
  isBreakthrough,
  loadGameData,
  stageOf,
  successRate,
  targetValue,
} from '../src';

const cfg = loadGameData().config.enhance;
const SUCCESS = 0;
const FAIL = 0.999999;

describe('레벨 구간', () => {
  it('강화 수치 20마다 1구간', () => {
    expect(stageOf(0, cfg)).toBe(0);
    expect(stageOf(19, cfg)).toBe(0);
    expect(stageOf(20, cfg)).toBe(1);
    expect(stageOf(41, cfg)).toBe(2);
    expect(stageOf(999, cfg)).toBe(49);
    expect(stageOf(1000, cfg)).toBe(50);
  });
});

describe('성공 확률', () => {
  it.each([
    [0, 0.95],
    [199, 0.95],
    [200, 0.8],
    [399, 0.8],
    [400, 0.6],
    [600, 0.4],
    [800, 0.2],
    [999, 0.2],
  ])('수치 %i → %f', (v, rate) => {
    expect(successRate(v, cfg)).toBeCloseTo(rate);
  });

  it('최대치 1000에서는 강화 불가', () => {
    expect(canEnhance(1000, cfg)).toBe(false);
    expect(successRate(1000, cfg)).toBe(0);
    expect(() => attemptEnhance(1000, 'common', SUCCESS, cfg)).toThrow();
  });

  it('보너스 ×1.1 적용, 최대 99% 제한', () => {
    expect(successRate(0, cfg, 1.1)).toBeCloseTo(0.99);
    expect(successRate(200, cfg, 1.1)).toBeCloseTo(0.88);
    expect(successRate(600, cfg, 1.1)).toBeCloseTo(0.44);
    expect(successRate(800, cfg, 1.1)).toBeCloseTo(0.22);
  });
});

describe('상승량과 50의 배수 멈춤', () => {
  it('등급별 상승량', () => {
    expect(targetValue(10, 'common', cfg)).toBe(11);
    expect(targetValue(10, 'advanced', cfg)).toBe(12);
    expect(targetValue(10, 'rare', cfg)).toBe(13);
    expect(targetValue(10, 'legendary', cfg)).toBe(15);
  });

  it('48에서 +3 → 50에서 멈춤', () => {
    expect(targetValue(48, 'rare', cfg)).toBe(50);
    expect(attemptEnhance(48, 'rare', SUCCESS, cfg).to).toBe(50);
  });

  it('50의 배수를 건너뛰지 않음 (98 + 전설 → 100)', () => {
    expect(targetValue(98, 'legendary', cfg)).toBe(100);
  });

  it('50에서 시작하면 다음 배수까지 자유롭게 오름', () => {
    expect(targetValue(50, 'legendary', cfg)).toBe(55);
    expect(isBreakthrough(50, 'legendary', cfg)).toBe(false);
  });

  it('최대치 1000을 넘지 않음', () => {
    expect(targetValue(998, 'legendary', cfg)).toBe(1000);
  });
});

describe('실패 처리', () => {
  it('일반 실패는 수치 유지', () => {
    const r = attemptEnhance(30, 'common', FAIL, cfg);
    expect(r.success).toBe(false);
    expect(r.breakthrough).toBe(false);
    expect(r.to).toBe(30);
  });

  it('49→50 돌파 실패 시 −1 (0~9구간)', () => {
    const r = attemptEnhance(49, 'common', FAIL, cfg);
    expect(r.breakthrough).toBe(true);
    expect(r.to).toBe(48);
  });

  it('48에서 희귀 재료 돌파 실패도 하락 (확정 규칙)', () => {
    const r = attemptEnhance(48, 'rare', FAIL, cfg);
    expect(r.breakthrough).toBe(true);
    expect(r.to).toBe(47);
  });

  it.each([
    [149, 1],
    [249, 2],
    [449, 3],
    [649, 5],
    [849, 8],
    [999, 8],
  ])('구간별 돌파 실패 하락: %i → −%i', (v, drop) => {
    expect(breakDropOf(v, cfg)).toBe(drop);
    expect(attemptEnhance(v, 'common', FAIL, cfg).to).toBe(v - drop);
  });

  it('돌파 실패로 레벨 구간이 내려갈 수 있음 (200에서 시작한 249는 아님, 0 아래로는 안 내려감)', () => {
    expect(attemptEnhance(399, 'common', FAIL, cfg).to).toBe(397);
    expect(stageOf(397, cfg)).toBe(19);
  });

  it('확률 경계: roll < rate 이면 성공', () => {
    expect(attemptEnhance(0, 'common', 0.9499, cfg).success).toBe(true);
    expect(attemptEnhance(0, 'common', 0.95, cfg).success).toBe(false);
  });
});
