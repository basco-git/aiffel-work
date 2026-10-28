import configJson from '../data/config.json';
import partsJson from '../data/parts.json';
import materialsJson from '../data/materials.json';
import equipmentJson from '../data/equipment.json';
import monstersJson from '../data/monsters.json';
import worldJson from '../data/world.json';
import dropsJson from '../data/drops.json';
import questsJson from '../data/quests.json';
import towerJson from '../data/tower.json';
import {
  ConfigSchema,
  DropsSchema,
  EquipmentSchema,
  MaterialsSchema,
  MonstersSchema,
  PartsSchema,
  QuestsSchema,
  TowerSchema,
  WorldSchema,
  FACTIONS,
  type Config,
  type DropsData,
  type EquipmentDef,
  type MaterialsData,
  type MonsterDef,
  type PartsData,
  type QuestsData,
  type TowerData,
  type WorldData,
} from './schema';

export interface GameData {
  config: Config;
  parts: PartsData;
  materials: MaterialsData;
  equipment: Map<string, EquipmentDef>;
  monsters: Map<string, MonsterDef>;
  world: WorldData;
  drops: DropsData;
  quests: QuestsData;
  tower: TowerData;
}

function parse<T>(name: string, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`[data/${name}.json] 형식 오류\n${msg}`);
  }
  return r.data;
}

/** 데이터 파일 사이의 참조(몬스터 id, 장비 id, 탐색 지점 등)가 실제로 있는지 확인한다. */
export function crossCheck(d: GameData): string[] {
  const errors: string[] = [];
  const pointIds = new Set(d.world.points.map((p) => p.id));
  for (const s of d.world.spawns) if (!d.monsters.has(s.monster)) errors.push(`world.spawns: 없는 몬스터 ${s.monster}`);
  for (const f of FACTIONS) {
    for (const q of d.quests[f].quests) {
      if (q.type === 'kill' && !d.monsters.has(q.target)) errors.push(`quests.${q.id}: 없는 몬스터 ${q.target}`);
      if (q.type === 'explore' && !pointIds.has(q.point)) errors.push(`quests.${q.id}: 없는 지점 ${q.point}`);
      if (q.type === 'tower' && !d.tower.floors.some((fl) => fl.floor === q.floor)) errors.push(`quests.${q.id}: 없는 층 ${q.floor}`);
      for (const it of q.rewards.items) if (!d.equipment.has(it)) errors.push(`quests.${q.id}: 없는 장비 ${it}`);
    }
  }
  for (const pool of Object.values(d.drops.equipmentPool))
    for (const it of pool) if (!d.equipment.has(it)) errors.push(`drops.equipmentPool: 없는 장비 ${it}`);
  for (const fl of d.tower.floors) {
    const m = fl.mission;
    const groups = m.type === 'hunt' ? m.waves.flat() : m.type === 'boss' ? m.summon : m.monsters;
    for (const g of groups) if (!d.monsters.has(g.monster)) errors.push(`tower.${fl.floor}: 없는 몬스터 ${g.monster}`);
  }
  return errors;
}

export function loadGameData(): GameData {
  const data: GameData = {
    config: parse('config', ConfigSchema, configJson),
    parts: parse('parts', PartsSchema, partsJson),
    materials: parse('materials', MaterialsSchema, materialsJson),
    equipment: new Map(parse('equipment', EquipmentSchema, equipmentJson).items.map((i) => [i.id, i])),
    monsters: new Map(parse('monsters', MonstersSchema, monstersJson).monsters.map((m) => [m.id, m])),
    world: parse('world', WorldSchema, worldJson),
    drops: parse('drops', DropsSchema, dropsJson),
    quests: parse('quests', QuestsSchema, questsJson),
    tower: parse('tower', TowerSchema, towerJson),
  };
  const errors = crossCheck(data);
  if (errors.length) throw new Error(`[data] 참조 오류\n${errors.join('\n')}`);
  return data;
}
