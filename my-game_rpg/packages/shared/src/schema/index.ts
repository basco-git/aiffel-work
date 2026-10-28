import { z } from 'zod';

export const FACTIONS = ['mechanic', 'genetic'] as const;
export const PART_IDS = ['head', 'arm', 'torso', 'leg', 'weapon', 'guard'] as const;
export const GRADES = ['common', 'advanced', 'rare', 'legendary'] as const;
export const SIZES = ['small', 'medium', 'large'] as const;

export const Faction = z.enum(FACTIONS);
export const PartId = z.enum(PART_IDS);
export const Grade = z.enum(GRADES);
export const Size = z.enum(SIZES);

const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Point = z.object({ x: z.number(), y: z.number() });
const GradeWeights = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const perFaction = <T extends z.ZodTypeAny>(t: T) => z.object({ mechanic: t, genetic: t });
const perPart = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ head: t, arm: t, torso: t, leg: t, weapon: t, guard: t });

const FactionConfig = z.object({
  name: z.string(),
  material: z.string(),
  tagline: z.string(),
  attack: z.enum(['ranged', 'melee']),
  attackInterval: z.number().positive(),
  range: z.number().positive(),
  arcDeg: z.number().optional(),
  projectileSpeed: z.number().min(0),
  damageMultiplier: z.number().positive(),
  canEquip: z.boolean(),
});

export const ConfigSchema = z.object({
  display: z.object({
    baseHeight: z.number().int().positive(),
    minWidth: z.number().int().positive(),
    maxWidth: z.number().int().positive(),
    tileWidth: z.number().int().positive(),
    tileHeight: z.number().int().positive(),
  }),
  player: z.object({
    baseHp: z.number().positive(),
    baseAtk: z.number().min(0),
    baseDef: z.number().min(0),
    baseCrit: z.number().min(0).max(1),
    critMultiplier: z.number().min(1),
    baseMoveSpeed: z.number().positive(),
    invulnAfterHit: z.number().min(0),
    baseRegenPerSec: z.number().min(0),
    radius: z.number().positive(),
    outOfCombatDelay: z.number().min(0),
    outOfCombatRegenPct: z.number().min(0),
  }),
  factions: perFaction(FactionConfig),
  enhance: z.object({
    pointsPerStage: z.number().int().positive(),
    maxValue: z.number().int().positive(),
    breakpointEvery: z.number().int().positive(),
    gain: z.object({ common: z.number().int(), advanced: z.number().int(), rare: z.number().int(), legendary: z.number().int() }),
    bands: z
      .array(z.object({ fromStage: z.number().int().min(0), rate: z.number().min(0).max(1), breakDrop: z.number().int().min(0) }))
      .min(1),
    rateBonusMultiplier: z.number().positive(),
    rateCap: z.number().min(0).max(1),
  }),
  deathPenalty: z.object({ minPct: z.number().min(0), maxPct: z.number().min(0) }),
  combat: z.object({ defenseConstant: z.number().positive(), knockback: z.number().min(0), monsterLeashRange: z.number().positive() }),
  save: z.object({ autosaveSeconds: z.number().positive() }),
  debug: z.object({
    enabled: z.boolean(),
    showButton: z.boolean(),
    grantMaterials: z.object({
      amount: z.number().int().positive(),
      parts: z.union([z.literal('all'), z.array(PartId)]),
      grades: z.array(Grade).min(1),
    }),
    grantEquipment: z.boolean(),
  }),
});

const StatBlock = z.object({
  maxHp: z.number().optional(),
  atk: z.number().optional(),
  def: z.number().optional(),
  crit: z.number().optional(),
  moveSpeedPct: z.number().optional(),
  attackSpeedPct: z.number().optional(),
});

export const PartsSchema = z.object({
  order: z.array(PartId).length(6),
  names: perFaction(perPart(z.string())),
  statsPerPoint: perFaction(perPart(StatBlock)),
});

export const MaterialsSchema = z.object({
  grades: z.array(Grade).length(4),
  gradeNames: z.object({ common: z.string(), advanced: z.string(), rare: z.string(), legendary: z.string() }),
  gradeColors: z.object({ common: z.string(), advanced: z.string(), rare: z.string(), legendary: z.string() }),
});

export const EquipmentSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slot: z.enum(['weapon', 'armor']),
      atk: z.number().min(0),
      def: z.number().min(0),
      tier: z.number().int().min(1),
    }),
  ),
});

export const MonstersSchema = z.object({
  monsters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      region: z.string(),
      size: Size,
      sizePx: z.number().positive(),
      hp: z.number().positive(),
      atk: z.number().min(0),
      def: z.number().min(0),
      speed: z.number().min(0),
      aggroRange: z.number().positive(),
      attackRange: z.number().positive(),
      attackInterval: z.number().positive(),
      respawn: z.number().positive(),
      primaryPart: z.union([PartId, z.literal('all')]),
      behavior: z.enum(['walk', 'float', 'rooted', 'charge']),
      ranged: z.object({ range: z.number(), projectileSpeed: z.number(), interval: z.number() }).optional(),
    }),
  ),
});

export const WorldSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['base', 'field', 'hub']),
      faction: Faction.optional(),
      rect: Rect,
      tile: z.string(),
      contamination: z.number().min(0).max(1),
      gate: z.object({ side: z.enum(['east', 'west', 'north', 'south']), from: z.number().int(), to: z.number().int() }).optional(),
      obstacle: z.object({ kind: z.enum(['tree', 'deepwater']), density: z.number().min(0).max(1), seed: z.number().int() }).optional(),
      clear: z.array(Rect).optional(),
    }),
  ),
  tower: z.object({ x: z.number(), y: z.number(), radius: z.number(), blocked: Rect }),
  npcs: perFaction(Point),
  respawn: perFaction(Point),
  points: z.array(z.object({ id: z.string(), name: z.string(), x: z.number(), y: z.number(), radius: z.number() })),
  spawns: z.array(z.object({ monster: z.string(), rect: Rect, count: z.number().int().positive() })),
});

const SizeWeights = z.record(z.string(), GradeWeights);
export const DropsSchema = z.object({
  dropChance: z.record(z.string(), z.number().min(0).max(1)),
  dropCount: z.record(z.string(), z.number().int().min(0)),
  primaryPartChance: z.number().min(0).max(1),
  gradeWeights: z.record(z.string(), SizeWeights),
  equipmentChance: z.record(z.string(), z.number().min(0).max(1)),
  equipmentPool: z.record(z.string(), z.array(z.string())),
});

const MaterialReward = z.object({ part: PartId, grade: Grade, count: z.number().int().positive() });
const QuestBase = {
  id: z.string(),
  title: z.string(),
  desc: z.string(),
  start: z.string(),
  end: z.string(),
  rewards: z.object({ materials: z.array(MaterialReward).default([]), items: z.array(z.string()).default([]) }),
};
export const QuestSchema = z.discriminatedUnion('type', [
  z.object({ ...QuestBase, type: z.literal('kill'), target: z.string(), count: z.number().int().positive() }),
  z.object({ ...QuestBase, type: z.literal('collect'), part: PartId, count: z.number().int().positive() }),
  z.object({ ...QuestBase, type: z.literal('explore'), point: z.string() }),
  z.object({ ...QuestBase, type: z.literal('enhance'), part: z.union([PartId, z.literal('any'), z.literal('all')]), value: z.number().int().positive() }),
  z.object({ ...QuestBase, type: z.literal('tower'), floor: z.number().int().positive() }),
]);
const FactionQuests = z.object({
  npc: z.object({ name: z.string(), greeting: z.string() }),
  quests: z.array(QuestSchema).min(1),
});
export const QuestsSchema = perFaction(FactionQuests);

const MonsterGroup = z.array(z.object({ monster: z.string(), count: z.number().int().positive() }));
export const TowerSchema = z.object({
  floors: z.array(
    z.object({
      floor: z.number().int().positive(),
      theme: z.string(),
      monsterScale: z.number().positive(),
      manager: z.object({
        name: z.string(),
        sizePx: z.number().positive(),
        hp: z.number().positive(),
        atk: z.number().min(0),
        def: z.number().min(0),
        speed: z.number().min(0),
        pattern: z.enum(['shooter', 'charger', 'summoner', 'boss']),
        color: z.string(),
      }),
      mission: z.discriminatedUnion('type', [
        z.object({ type: z.literal('hunt'), waves: z.array(MonsterGroup).min(1) }),
        z.object({
          type: z.literal('maze'),
          cellsW: z.number().int().min(3),
          cellsH: z.number().int().min(3),
          timeLimit: z.number().positive(),
          seed: z.number().int(),
          monsters: MonsterGroup,
        }),
        z.object({
          type: z.literal('quest'),
          objective: z.object({ kind: z.enum(['destroy', 'collect']), count: z.number().int().positive(), label: z.string(), hp: z.number().optional() }),
          monsters: MonsterGroup,
          spawnInterval: z.number().positive(),
          maxAlive: z.number().int().positive(),
        }),
        z.object({ type: z.literal('boss'), summon: MonsterGroup }),
      ]),
    }),
  ),
});

export type Faction = z.infer<typeof Faction>;
export type PartId = z.infer<typeof PartId>;
export type Grade = z.infer<typeof Grade>;
export type Size = z.infer<typeof Size>;
export type Config = z.infer<typeof ConfigSchema>;
export type PartsData = z.infer<typeof PartsSchema>;
export type MaterialsData = z.infer<typeof MaterialsSchema>;
export type EquipmentData = z.infer<typeof EquipmentSchema>;
export type EquipmentDef = EquipmentData['items'][number];
export type MonstersData = z.infer<typeof MonstersSchema>;
export type MonsterDef = MonstersData['monsters'][number];
export type WorldData = z.infer<typeof WorldSchema>;
export type RegionDef = WorldData['regions'][number];
export type DropsData = z.infer<typeof DropsSchema>;
export type QuestDef = z.infer<typeof QuestSchema>;
export type QuestsData = z.infer<typeof QuestsSchema>;
export type TowerData = z.infer<typeof TowerSchema>;
export type FloorDef = TowerData['floors'][number];
export type StatBlock = z.infer<typeof StatBlock>;
