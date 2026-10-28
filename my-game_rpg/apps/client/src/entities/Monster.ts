import Phaser from 'phaser';
import type { FloorDef, MonsterDef, PartId } from '@tb/shared';
import { depthOf, toScreen } from '../core/iso';
import { shadowKey } from '../gfx/textures';

export type Tier = 'small' | 'medium' | 'large' | 'manager' | 'boss' | 'object';
export type Behavior = MonsterDef['behavior'] | 'manager' | 'object';

/** 필드 몬스터·탑 관리자·미션 오브젝트를 같은 형태로 다루기 위한 사양 */
export interface MonsterSpec {
  texture: string;
  name: string;
  /** 퀘스트 처치 집계용 몬스터 id */
  monsterId?: string;
  tier: Tier;
  sizePx: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackInterval: number;
  behavior: Behavior;
  ranged?: { range: number; projectileSpeed: number; interval: number };
  pattern?: FloorDef['manager']['pattern'];
  primaryPart: PartId | 'all';
  dropArea: string;
  respawn?: number;
}

export function specFromDef(d: MonsterDef, scale = 1, dropArea = d.region): MonsterSpec {
  return {
    texture: `mon_${d.id}`,
    name: d.name,
    monsterId: d.id,
    tier: d.size,
    sizePx: d.sizePx,
    hp: Math.round(d.hp * scale),
    atk: Math.round(d.atk * scale * 10) / 10,
    def: Math.round(d.def * scale),
    speed: d.speed,
    aggroRange: d.aggroRange,
    attackRange: d.attackRange,
    attackInterval: d.attackInterval,
    behavior: d.behavior,
    ranged: d.ranged,
    primaryPart: d.primaryPart,
    dropArea,
    respawn: d.respawn,
  };
}

export function specFromManager(fl: FloorDef): MonsterSpec {
  const m = fl.manager;
  return {
    texture: `mgr_${fl.floor}`,
    name: m.name,
    tier: m.pattern === 'boss' ? 'boss' : 'manager',
    sizePx: m.sizePx,
    hp: m.hp,
    atk: m.atk,
    def: m.def,
    speed: m.speed,
    aggroRange: 30,
    attackRange: 1.4,
    attackInterval: 1.2,
    behavior: 'manager',
    pattern: m.pattern,
    primaryPart: 'all',
    dropArea: 'tower',
  };
}

export type MonState = 'idle' | 'chase' | 'windup' | 'dashWindup' | 'dash' | 'return';

let NEXT_ID = 1;

export class Monster {
  readonly id = NEXT_ID++;
  readonly pos: { x: number; y: number };
  readonly home: { x: number; y: number };
  readonly radius: number;
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  state: MonState = 'idle';
  dead = false;
  /** 공격 쿨다운 / 원거리 쿨다운 / 특수 패턴 쿨다운 */
  cd = 0;
  rangedCd = 1;
  specialCd = 3;
  stateT = 0;
  wander: { x: number; y: number } | null = null;
  wanderT = 0;
  dashDir = { x: 0, y: 0 };
  dashHit = false;
  /** 마지막으로 맞은 뒤 지난 시간 (체력바 표시용) */
  sinceHurt = 99;
  /** 리스폰 정보 (필드 몬스터) */
  spawnRect?: [number, number, number, number];
  homeRect?: [number, number, number, number];
  private animT = Math.random();
  private frame = 0;
  private flashT = 0;
  private lift: number;

  constructor(
    scene: Phaser.Scene,
    readonly spec: MonsterSpec,
    x: number,
    y: number,
  ) {
    this.pos = { x, y };
    this.home = { x, y };
    this.hp = this.maxHp = spec.hp;
    this.radius = Math.max(0.28, (spec.sizePx / 32) * 0.42);
    this.lift = spec.behavior === 'float' ? 8 : 0;
    const shadowR = Math.max(5, spec.sizePx * 0.32);
    this.shadow = scene.add.image(0, 0, shadowKey(scene, shadowR));
    this.sprite = scene.add.image(0, 0, `${spec.texture}_0`).setOrigin(0.5, spec.behavior === 'object' ? 0.95 : 0.92);
    this.sync();
  }

  get alive() {
    return !this.dead;
  }

  update(dt: number, moving: boolean, faceScreenX: number) {
    this.cd = Math.max(0, this.cd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.sinceHurt += dt;
    this.animT += dt * (moving ? 1 : 0.35);
    if (this.animT > 0.22 && this.spec.behavior !== 'object') {
      this.animT = 0;
      this.frame ^= 1;
      this.sprite.setTexture(`${this.spec.texture}_${this.frame}`);
    }
    if (Math.abs(faceScreenX) > 0.05 && this.spec.behavior !== 'object') this.sprite.setFlipX(faceScreenX < 0);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.applyStateTint();
    }
    this.sync();
  }

  /** 공격 예고(빨강)·돌진 예고(주황) 색 */
  applyStateTint() {
    if (this.flashT > 0) return;
    if (this.state === 'windup') this.sprite.setTint(0xff9090);
    else if (this.state === 'dashWindup') this.sprite.setTint(0xffb040);
    else this.sprite.clearTint();
  }

  hurtFlash() {
    this.sprite.setTintFill(0xffffff);
    this.flashT = 0.07;
    this.sinceHurt = 0;
  }

  sync() {
    const { sx, sy } = toScreen(this.pos.x, this.pos.y);
    const bob = this.lift ? Math.sin(performance.now() / 260 + this.id) * 2 : 0;
    this.sprite.setPosition(Math.round(sx), Math.round(sy - this.lift + bob));
    this.shadow.setPosition(Math.round(sx), Math.round(sy));
    const d = depthOf(this.pos.x, this.pos.y);
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 0.5);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
