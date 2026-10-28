import { describe, expect, it } from 'vitest';
import {
  PART_IDS,
  applyDeathPenalty,
  applyQuestEvent,
  calcDamage,
  computeStats,
  isQuestComplete,
  loadGameData,
  migrateSave,
  newSave,
  penaltyAmount,
  penaltyPct,
  rollDrops,
  stageOf,
  type PartId,
} from '../src';

const data = loadGameData();
const { config } = data;

function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function enhanceOf(v: number): Record<PartId, number> {
  return Object.fromEntries(PART_IDS.map((p) => [p, v])) as Record<PartId, number>;
}

describe('데이터 파일', () => {
  it('모든 데이터가 스키마와 참조 검사를 통과', () => {
    expect(data.monsters.size).toBe(10);
    expect(data.quests.mechanic.quests).toHaveLength(10);
    expect(data.quests.genetic.quests).toHaveLength(10);
    expect(data.tower.floors).toHaveLength(10);
  });

  it('해협 몬스터가 같은 크기의 정글 몬스터보다 강함', () => {
    const avg = (region: string, size: string) => {
      const ms = [...data.monsters.values()].filter((m) => m.region === region && m.size === size);
      return ms.reduce((a, m) => a + m.hp * m.atk, 0) / ms.length;
    };
    for (const size of ['small', 'medium', 'large']) expect(avg('strait', size)).toBeGreaterThan(avg('jungle', size));
  });

  it('해협 오염 농도가 정글보다 높음', () => {
    const c = (id: string) => data.world.regions.find((r) => r.id === id)!.contamination;
    expect(c('strait')).toBeGreaterThan(c('jungle'));
  });
});

describe('사망 페널티', () => {
  const dp = config.deathPenalty;

  it('오염 농도에 비례해 1%~5%', () => {
    expect(penaltyPct(0, dp)).toBeCloseTo(0.01);
    expect(penaltyPct(1, dp)).toBeCloseTo(0.05);
    expect(penaltyPct(0.3, dp)).toBeCloseTo(0.022);
    expect(penaltyPct(0.7, dp)).toBeCloseTo(0.038);
  });

  it('올림, 최소 1, 0이면 감소 없음', () => {
    expect(penaltyAmount(30, 0.022)).toBe(1);
    expect(penaltyAmount(100, 0.022)).toBe(3);
    expect(penaltyAmount(500, 0.05)).toBe(25);
    expect(penaltyAmount(1, 0.01)).toBe(1);
    expect(penaltyAmount(0, 0.05)).toBe(0);
  });

  it('무작위 부위 1곳만 감소, 구간 하락 가능 (41 → 39)', () => {
    const enhance = enhanceOf(41);
    const r = applyDeathPenalty(enhance, 1, 0.5, dp); // 41 × 5% = 2.05 → 3
    expect(PART_IDS).toContain(r.part);
    expect(r.from).toBe(41);
    expect(r.to).toBe(38);
    expect(stageOf(r.from, config.enhance)).toBe(2);
    expect(stageOf(r.to, config.enhance)).toBe(1);
  });

  it('난수에 따라 6개 부위가 모두 선택될 수 있음', () => {
    const picked = new Set([0, 0.17, 0.34, 0.5, 0.67, 0.99].map((r) => applyDeathPenalty(enhanceOf(10), 0.3, r, dp).part));
    expect(picked.size).toBe(6);
  });
});

describe('스탯', () => {
  it('강화 0이면 기본 스탯', () => {
    const s = computeStats('mechanic', enhanceOf(0), [], config, data.parts);
    expect(s.maxHp).toBe(config.player.baseHp);
    expect(s.atk).toBe(config.player.baseAtk);
    expect(s.crit).toBeCloseTo(config.player.baseCrit);
  });

  it('부위별로 다른 스탯이 오름', () => {
    const base = computeStats('genetic', enhanceOf(0), [], config, data.parts);
    const up = (part: PartId) => computeStats('genetic', { ...enhanceOf(0), [part]: 100 }, [], config, data.parts);
    expect(up('head').crit).toBeGreaterThan(base.crit);
    expect(up('arm').atk).toBeGreaterThan(base.atk);
    expect(up('torso').maxHp).toBeGreaterThan(base.maxHp);
    expect(up('leg').moveSpeed).toBeGreaterThan(base.moveSpeed);
    expect(up('weapon').atk).toBeGreaterThan(base.atk);
    expect(up('weapon').attackInterval).toBeLessThan(base.attackInterval);
    expect(up('guard').def).toBeGreaterThan(base.def);
  });

  it('메카닉 장비는 스탯에 더해지고, 유전공학은 장비를 쓸 수 없음', () => {
    const gun = data.equipment.get('pulse_rifle')!;
    const plate = data.equipment.get('scrap_plate')!;
    const mech = computeStats('mechanic', enhanceOf(0), [gun, plate], config, data.parts);
    expect(mech.atk).toBe(config.player.baseAtk + gun.atk);
    expect(mech.def).toBe(plate.def);
    const gen = computeStats('genetic', enhanceOf(0), [gun, plate], config, data.parts);
    expect(gen.def).toBe(0);
  });

  it('피해량은 방어력으로 감쇠, 최소 1', () => {
    expect(calcDamage(10, 0, false, config)).toBe(10);
    expect(calcDamage(10, 100, false, config)).toBe(5);
    expect(calcDamage(1, 1000, false, config)).toBe(1);
    expect(calcDamage(10, 0, true, config)).toBe(16);
  });
});

describe('드롭', () => {
  it('주 드롭 부위가 우선 (primaryPartChance)', () => {
    const r = rollDrops({ tier: 'small', area: 'jungle', primaryPart: 'arm' }, 'genetic', false, data.drops, seq(0, 0, 0));
    expect(r.materials).toEqual([{ part: 'arm', grade: 'common', count: 1 }]);
  });

  it('유전공학은 장비를 받지 않음', () => {
    const src = { tier: 'boss', area: 'tower', primaryPart: 'all' as const };
    expect(rollDrops(src, 'genetic', false, data.drops, seq(0.1)).items).toHaveLength(0);
    expect(rollDrops(src, 'mechanic', true, data.drops, seq(0.1)).items.length).toBe(1);
  });

  it('대형은 일반 몬스터보다 높은 등급이 나올 확률이 큼', () => {
    let rng = 12345;
    const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
    const score = (tier: string) => {
      let s = 0;
      for (let i = 0; i < 2000; i++)
        for (const m of rollDrops({ tier, area: 'jungle', primaryPart: 'all' }, 'genetic', false, data.drops, rand).materials)
          s += ['common', 'advanced', 'rare', 'legendary'].indexOf(m.grade) * m.count;
      return s;
    };
    expect(score('large')).toBeGreaterThan(score('small'));
  });
});

describe('퀘스트', () => {
  const [q1, q2, q3, q4, , , , q8, q9] = data.quests.mechanic.quests;
  const view = { enhance: enhanceOf(0), highestCleared: 0 };

  it('처치 퀘스트는 대상 몬스터만 집계', () => {
    let p = 0;
    p = applyQuestEvent(q1!, p, { type: 'kill', monster: 'thorn_sprout' });
    expect(p).toBe(0);
    for (let i = 0; i < 7; i++) p = applyQuestEvent(q1!, p, { type: 'kill', monster: 'poison_ant' });
    expect(p).toBe(5);
    expect(isQuestComplete(q1!, p, view)).toBe(true);
  });

  it('수집 퀘스트는 해당 부위만 집계', () => {
    let p = applyQuestEvent(q2!, 0, { type: 'collect', part: 'arm', count: 3 });
    expect(p).toBe(0);
    p = applyQuestEvent(q2!, p, { type: 'collect', part: 'head', count: 2 });
    expect(isQuestComplete(q2!, p, view)).toBe(false);
    p = applyQuestEvent(q2!, p, { type: 'collect', part: 'head', count: 2 });
    expect(isQuestComplete(q2!, p, view)).toBe(true);
  });

  it('강화 퀘스트 (any / all)', () => {
    expect(isQuestComplete(q3!, 0, { ...view, enhance: { ...enhanceOf(0), leg: 10 } })).toBe(true);
    expect(isQuestComplete(q8!, 0, { ...view, enhance: { ...enhanceOf(20), head: 19 } })).toBe(false);
    expect(isQuestComplete(q8!, 0, { ...view, enhance: enhanceOf(20) })).toBe(true);
  });

  it('탐색과 탑 퀘스트', () => {
    expect(isQuestComplete(q4!, applyQuestEvent(q4!, 0, { type: 'explore', point: 'jungle_nest' }), view)).toBe(true);
    expect(isQuestComplete(q9!, 0, { ...view, highestCleared: 2 })).toBe(false);
    expect(isQuestComplete(q9!, 0, { ...view, highestCleared: 3 })).toBe(true);
  });
});

describe('세이브', () => {
  it('새 세이브는 모든 부위 0, 버전 포함', () => {
    const s = newSave('genetic', { x: 1, y: 2 });
    expect(s.version).toBe(1);
    expect(Object.values(s.enhance).every((v) => v === 0)).toBe(true);
  });

  it('빠진 필드를 기본값으로 채우고, 잘못된 데이터는 거부', () => {
    const partial = { version: 1, faction: 'mechanic', enhance: { head: 7 } };
    const s = migrateSave(partial)!;
    expect(s.enhance.head).toBe(7);
    expect(s.enhance.arm).toBe(0);
    expect(s.materials.leg.rare).toBe(0);
    expect(migrateSave({ faction: 'alien' })).toBeNull();
    expect(migrateSave(null)).toBeNull();
  });
});
