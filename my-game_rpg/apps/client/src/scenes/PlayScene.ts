import Phaser from 'phaser';
import { calcDamage, rollDrops } from '@tb/shared';
import { CFG, DATA } from '../core/data';
import { input } from '../core/input';
import { depthOf, screenDirToWorld, toScreen, toWorld } from '../core/iso';
import { hash2 } from '../core/rng';
import { store, type Command } from '../core/store';
import { Monster, specFromDef, type MonsterSpec } from '../entities/Monster';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { shadowKey } from '../gfx/textures';
import { TILE_VARIANTS } from '../gfx/tiles';
import { BLOCK_MON, BLOCK_SHOT, BLOCK_WALK, type Level } from '../level/level';
import { TowerMission } from '../level/tower';
import { buildWorld } from '../level/worldLevel';

export interface PlaySceneData {
  mode: 'world' | 'tower';
  floor?: number;
}

const HALF_W = CFG.display.tileWidth / 2;
const HALF_H = CFG.display.tileHeight / 2;
const GRADE_COLOR = DATA.materials.gradeColors;

export class PlayScene extends Phaser.Scene {
  level!: Level;
  player!: Player;
  mode: 'world' | 'tower' = 'world';
  floor = 0;
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  /** 탑 미션 등에서 처치 시 호출 */
  onKill: ((m: Monster) => void) | null = null;
  mission: TowerMission | null = null;
  protected bars!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private unsub: (() => void)[] = [];
  private saveTimer = 0;
  private exploreDone = new Set<string>();
  private respawnQueue: { spawn: (typeof DATA.world.spawns)[number]; t: number }[] = [];
  private pointerAttack = false;

  constructor() {
    super('play');
  }

  init(data: PlaySceneData) {
    this.mode = data?.mode ?? 'world';
    this.floor = data?.floor ?? 0;
    this.monsters = [];
    this.projectiles = [];
    this.respawnQueue = [];
    this.exploreDone.clear();
    this.onKill = null;
    this.mission = null;
  }

  create() {
    const save = store.save!;
    this.bars = this.add.graphics().setDepth(1e6);
    this.buildMode();

    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(250);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.pointerAttack = true;
    });
    this.input.on('pointerup', () => (this.pointerAttack = false));
    this.input.on('gameout', () => (this.pointerAttack = false));

    this.unsub.push(store.onCommand((c) => this.onCommand(c)));
    this.events.once('shutdown', () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.input.removeAllListeners();
    });
    void save;
  }

  /** 월드/탑 구성. 탑은 TowerScene 확장에서 덮어쓴다. */
  protected buildMode() {
    const save = store.save!;
    if (this.mode === 'tower') {
      const mission = new TowerMission(this, this.floor);
      this.mission = mission;
      this.level = mission.buildLevel();
      this.drawLevel(this.level);
      this.player = new Player(this, save.faction, this.level.spawn.x, this.level.spawn.y);
      this.onKill = (m) => mission.onKill(m);
      store.setRuntime({ location: 'tower', floor: this.floor, regionId: 'tower', regionName: `탑 ${this.floor}층`, safe: false, interact: null });
      mission.start();
      return;
    }
    this.level = buildWorld(save.faction);
    this.drawLevel(this.level);
    this.placeNpcs();
    const start = this.level.circleBlocked(save.position.x, save.position.y, CFG.player.radius, BLOCK_WALK)
      ? this.level.spawn
      : save.position;
    this.player = new Player(this, save.faction, start.x, start.y);
    for (const sp of DATA.world.spawns) for (let i = 0; i < sp.count; i++) this.spawnField(sp);
    store.setRuntime({ location: 'world', floor: 0, mission: null });
  }

  // ---------------- 맵 그리기 ----------------
  drawLevel(lv: Level) {
    const ox = lv.h * HALF_W;
    const rt = this.add.renderTexture(-ox, 0, (lv.w + lv.h) * HALF_W, (lv.w + lv.h) * HALF_H + HALF_H * 2).setOrigin(0, 0);
    rt.setDepth(-1e6);
    rt.beginDraw();
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const t = lv.tiles[lv.idx(x, y)];
        if (t === 'void') continue;
        const v = Math.floor(hash2(x, y, 3) * TILE_VARIANTS);
        rt.batchDrawFrame(`tile_${t}_${v}`, undefined, ox + (x - y) * HALF_W - HALF_W, (x + y) * HALF_H);
      }
    }
    rt.endDraw();
    for (const p of lv.props) {
      const { sx, sy } = toScreen(p.x, p.y);
      this.add
        .image(sx, sy, p.key)
        .setOrigin(0.5, p.originY ?? 1)
        .setDepth(depthOf(p.x, p.y) + (p.depthBias ?? 0));
    }
  }

  private placeNpcs() {
    for (const f of ['mechanic', 'genetic'] as const) {
      const n = DATA.world.npcs[f];
      const { sx, sy } = toScreen(n.x, n.y);
      const img = this.add.image(sx, sy, `npc_${f}_0`).setOrigin(0.5, 0.97).setDepth(depthOf(n.x, n.y));
      this.add.image(sx, sy, shadowKey(this, 9)).setDepth(depthOf(n.x, n.y) - 0.5);
      if (f === 'genetic') img.setFlipX(true);
      let fr = 0;
      this.time.addEvent({ delay: 600, loop: true, callback: () => img.setTexture(`npc_${f}_${(fr ^= 1)}`) });
    }
  }

  // ---------------- 몬스터 생성 ----------------
  private spawnField(sp: (typeof DATA.world.spawns)[number]) {
    const def = DATA.monsters.get(sp.monster)!;
    const mask = def.behavior === 'float' ? BLOCK_MON | BLOCK_SHOT : BLOCK_WALK | BLOCK_MON;
    const at = this.level.randomOpenIn(sp.rect, mask);
    if (!at) return;
    const m = this.spawnMonster(specFromDef(def), at.x, at.y);
    m.spawnRect = sp.rect;
    m.homeRect = sp.rect;
    (m as Monster & { spawnRef?: typeof sp }).spawnRef = sp;
  }

  spawnMonster(spec: MonsterSpec, x: number, y: number): Monster {
    const m = new Monster(this, spec, x, y);
    this.monsters.push(m);
    return m;
  }

  // ---------------- 명령 ----------------
  onCommand(c: Command) {
    switch (c.type) {
      case 'teleport':
        this.player.pos.x = c.x;
        this.player.pos.y = c.y;
        this.player.sync();
        break;
      case 'heal':
        store.setHp(store.stats.maxHp);
        break;
      case 'killAll':
        for (const m of this.monsters)
          if (m.alive && Math.hypot(m.pos.x - this.player.pos.x, m.pos.y - this.player.pos.y) < 14) this.damageMonster(m, m.hp, false);
        break;
      case 'enterFloor':
        this.goTower(c.floor);
        break;
      case 'leaveTower':
        this.goWorld();
        break;
    }
  }

  goTower(floor: number) {
    if (this.mode === 'world') store.save!.position = { ...this.player.pos };
    void store.persistNow();
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(220, () => this.scene.restart({ mode: 'tower', floor }));
  }

  goWorld(respawn = false) {
    if (respawn) store.save!.position = { ...DATA.world.respawn[store.faction] };
    void store.persistNow();
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(220, () => this.scene.restart({ mode: 'world' }));
  }

  // ---------------- 갱신 ----------------
  update(_t: number, deltaMs: number) {
    if (store.screen !== 'play' || !store.save) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    const moving = this.updateMovement(dt);
    this.player.update(dt, moving);
    this.updatePlayerAttack();
    this.updateMonsters(dt);
    this.updateProjectiles(dt);
    this.updateRespawns(dt);
    this.updateRegion(dt);
    this.drawBars();
    this.updateMode(dt);

    this.saveTimer += dt;
    if (this.saveTimer >= CFG.save.autosaveSeconds) {
      this.saveTimer = 0;
      if (this.mode === 'world' && !this.player.dead) {
        store.save.position = { x: this.player.pos.x, y: this.player.pos.y };
        void store.persistNow();
      }
    }
  }

  /** 탑 미션 갱신용 확장 지점 */
  protected updateMode(dt: number) {
    if (this.mission && !this.player.dead) this.mission.update(dt);
  }

  private typing(): boolean {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  }

  private updateMovement(dt: number): boolean {
    if (this.player.dead) return false;
    let dx = input.stickX;
    let dy = input.stickY;
    if (!this.typing()) {
      const k = this.keys;
      if (k.A!.isDown || k.LEFT!.isDown) dx -= 1;
      if (k.D!.isDown || k.RIGHT!.isDown) dx += 1;
      if (k.W!.isDown || k.UP!.isDown) dy -= 1;
      if (k.S!.isDown || k.DOWN!.isDown) dy += 1;
    }
    const mag = Math.min(1, Math.hypot(dx, dy));
    if (mag < 0.15) return false;
    // 대각선 입력이 타일 축을 따라가도록 가로 성분을 2배로 보정
    const dir = screenDirToWorld(dx * 2, dy);
    const speed = store.stats.moveSpeed * mag;
    this.level.move(this.player.pos, dir.x * speed * dt, dir.y * speed * dt, this.player.radius, BLOCK_WALK);
    this.player.facing = dir;
    return true;
  }

  // ---------------- 플레이어 공격 ----------------
  private nearestMonster(range: number): Monster | null {
    let best: Monster | null = null;
    let bd = range;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - this.player.pos.x, m.pos.y - this.player.pos.y) - m.radius;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private updatePlayerAttack() {
    const p = this.player;
    if (p.dead || store.panel) return;
    const f = CFG.factions[store.faction];
    let dir: { x: number; y: number } | null = null;
    if (this.pointerAttack && this.input.activePointer.isDown) {
      const ptr = this.input.activePointer;
      const w = toWorld(ptr.worldX, ptr.worldY + 10);
      const len = Math.hypot(w.x - p.pos.x, w.y - p.pos.y);
      if (len > 0.05) dir = { x: (w.x - p.pos.x) / len, y: (w.y - p.pos.y) / len };
    } else if ((!this.typing() && this.keys.SPACE!.isDown) || input.attackHeld) {
      const t = this.nearestMonster(f.range * 1.3 + 0.5);
      if (t) {
        const len = Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) || 1;
        dir = { x: (t.pos.x - p.pos.x) / len, y: (t.pos.y - p.pos.y) / len };
      } else dir = { ...p.facing };
    }
    if (!dir || p.attackCooldown > 0) return;
    p.facing = dir;
    p.attackCooldown = store.stats.attackInterval;
    if (f.attack === 'ranged') this.fireBolt(dir);
    else this.slash(dir);
  }

  private rollPlayerHit(def: number) {
    const st = store.stats;
    const crit = Math.random() < st.crit;
    return { dmg: calcDamage(st.atk, def, crit, CFG), crit };
  }

  private fireBolt(dir: { x: number; y: number }) {
    const f = CFG.factions[store.faction];
    const p = this.player.pos;
    const start = { x: p.x + dir.x * 0.5, y: p.y + dir.y * 0.5 };
    const v = { x: dir.x * f.projectileSpeed, y: dir.y * f.projectileSpeed };
    this.projectiles.push(new Projectile(this, 'fx_bolt', start, v, f.range / f.projectileSpeed, 'player', store.stats.atk, 0.25, undefined, 16));
  }

  private slash(dir: { x: number; y: number }) {
    const f = CFG.factions[store.faction];
    const p = this.player.pos;
    const s = toScreen(dir.x, dir.y);
    const at = toScreen(p.x + dir.x * 0.9, p.y + dir.y * 0.9);
    const fx = this.add
      .image(at.sx, at.sy - 14, 'fx_slash')
      .setRotation(Math.atan2(s.sy, s.sx))
      .setDepth(depthOf(p.x, p.y) + 2);
    this.tweens.add({ targets: fx, alpha: 0, scale: 1.25, duration: 160, onComplete: () => fx.destroy() });
    const half = ((f.arcDeg ?? 120) / 2) * (Math.PI / 180);
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.pos.x - p.x;
      const dy = m.pos.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d - m.radius > f.range) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dy * dir.y) / (d || 1))));
      if (d > m.radius + 0.3 && ang > half) continue;
      const { dmg, crit } = this.rollPlayerHit(m.spec.def);
      this.damageMonster(m, dmg, crit, dir);
    }
  }

  // ---------------- 피해 처리 ----------------
  popNumber(x: number, y: number, text: string, color: string, big = false) {
    const { sx, sy } = toScreen(x, y);
    const t = this.add
      .text(sx, sy - 30, text, {
        fontFamily: 'monospace',
        fontSize: big ? '12px' : '10px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1e6 + 1);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  damageMonster(m: Monster, dmg: number, crit: boolean, dir?: { x: number; y: number }) {
    if (!m.alive) return;
    m.hp -= dmg;
    m.hurtFlash();
    this.popNumber(m.pos.x, m.pos.y - m.radius, crit ? `${dmg}!` : String(dmg), crit ? '#ffd166' : '#ffffff', crit);
    if (m.state === 'idle' || m.state === 'return') m.state = 'chase';
    const light = m.spec.tier === 'small' || m.spec.tier === 'medium';
    if (dir && light && m.spec.behavior !== 'rooted') {
      const kb = CFG.combat.knockback * (m.spec.tier === 'small' ? 1 : 0.5);
      this.level.move(m.pos, dir.x * kb, dir.y * kb, m.radius, this.monsterMask(m));
    }
    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Monster) {
    m.dead = true;
    m.hp = 0;
    this.tweens.add({ targets: [m.sprite, m.shadow], alpha: 0, duration: 350, onComplete: () => m.destroy() });
    const save = store.save!;
    if (m.spec.tier !== 'object') {
      save.stats.kills++;
      const canEquip = CFG.factions[save.faction].canEquip;
      const drop = rollDrops({ tier: m.spec.tier, area: m.spec.dropArea, primaryPart: m.spec.primaryPart }, save.faction, canEquip, DATA.drops, Math.random);
      if (drop.materials.length) store.addMaterials(drop.materials, 'drop');
      if (drop.items.length) store.addItems(drop.items);
      for (const d of drop.materials) store.toast(`+ ${store.materialName(d.part, d.grade)} ×${d.count}`, GRADE_COLOR[d.grade]);
      for (const id of drop.items) store.toast(`+ 장비 획득: ${DATA.equipment.get(id)!.name}`, '#ffb340');
      if (m.spec.monsterId) store.questEvent({ type: 'kill', monster: m.spec.monsterId });
      if (m.spec.tier === 'large') store.toast(`${m.spec.name} 처치!`, '#ffd166');
    }
    const ref = (m as Monster & { spawnRef?: (typeof DATA.world.spawns)[number] }).spawnRef;
    if (ref && m.spec.respawn) this.respawnQueue.push({ spawn: ref, t: m.spec.respawn });
    this.onKill?.(m);
  }

  damagePlayer(atk: number, from?: { x: number; y: number }) {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    const dmg = calcDamage(atk, store.stats.def, false, CFG);
    store.setHp(store.rt.hp - dmg);
    p.flash();
    p.invuln = CFG.player.invulnAfterHit;
    p.sinceHit = 0;
    this.popNumber(p.pos.x, p.pos.y, String(dmg), '#ff5a6a');
    if (from) {
      const dx = p.pos.x - from.x;
      const dy = p.pos.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      this.level.move(p.pos, (dx / len) * 0.25, (dy / len) * 0.25, p.radius, BLOCK_WALK);
    }
    if (dmg > store.stats.maxHp * 0.15) this.cameras.main.shake(120, 0.004);
    if (store.rt.hp <= 0) this.playerDie();
  }

  private playerDie() {
    const p = this.player;
    p.dead = true;
    const region = this.level.regionAt(p.pos.x, p.pos.y);
    const contamination = this.mode === 'world' && region?.kind === 'field' ? region.contamination : null;
    const msg = store.onDeath(contamination);
    store.setHp(0);
    store.toast(msg, '#ff8a9a');
    this.tweens.add({ targets: p.sprite, alpha: 0.2, angle: 90, duration: 400 });
    this.time.delayedCall(1300, () => {
      store.setHp(store.stats.maxHp);
      if (this.mode === 'tower') {
        this.goWorld(true);
        return;
      }
      const r = DATA.world.respawn[store.faction];
      p.pos.x = r.x;
      p.pos.y = r.y;
      p.dead = false;
      p.sprite.setAlpha(1).setAngle(0);
      p.invuln = 1.5;
      p.sync();
      for (const m of this.monsters) if (m.state !== 'idle') m.state = 'return';
      store.save!.position = { ...r };
      void store.persistNow();
    });
  }

  // ---------------- 몬스터 AI ----------------
  private monsterMask(m: Monster) {
    return m.spec.behavior === 'float' ? BLOCK_MON | BLOCK_SHOT : BLOCK_WALK | BLOCK_MON;
  }

  private playerTargetable(): boolean {
    if (this.player.dead) return false;
    if (this.mode === 'tower') return true;
    return this.level.regionAt(this.player.pos.x, this.player.pos.y)?.kind !== 'base';
  }

  private stepToward(m: Monster, tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - m.pos.x;
    const dy = ty - m.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return 0;
    const step = Math.min(d, speed * dt);
    this.level.move(m.pos, (dx / d) * step, (dy / d) * step, m.radius, this.monsterMask(m));
    return dx;
  }

  monsterShoot(m: Monster, dir: { x: number; y: number }, speed: number, atkScale: number, texture = 'fx_spit') {
    const v = { x: dir.x * speed, y: dir.y * speed };
    const start = { x: m.pos.x + dir.x * m.radius, y: m.pos.y + dir.y * m.radius };
    this.projectiles.push(new Projectile(this, texture, start, v, 10 / speed + 0.5, 'monster', m.spec.atk * atkScale, 0.3, m, Math.min(40, m.spec.sizePx * 0.4)));
  }

  /** 관리자 패턴 등 특수 행동 확장 지점. true를 돌려주면 기본 AI를 건너뛴다. */
  protected specialAI(m: Monster, dt: number, dist: number): boolean {
    return this.mission ? this.mission.managerAI(m, dt, dist) : false;
  }

  private updateMonsters(dt: number) {
    const p = this.player.pos;
    const targetable = this.playerTargetable();
    const leash = CFG.combat.monsterLeashRange;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const sp = m.spec;
      const dist = Math.hypot(p.x - m.pos.x, p.y - m.pos.y);
      let faceX = 0;
      let moving = false;

      if (sp.behavior === 'object') {
        m.update(dt, false, 0);
        continue;
      }
      if (this.specialAI(m, dt, dist)) {
        m.update(dt, true, toScreen(p.x - m.pos.x, p.y - m.pos.y).sx);
        continue;
      }

      const reach = sp.attackRange + this.player.radius + m.radius * 0.5;
      switch (m.state) {
        case 'idle': {
          if (targetable && dist <= sp.aggroRange) {
            m.state = 'chase';
            break;
          }
          if (sp.behavior === 'rooted') break;
          m.wanderT -= dt;
          if (!m.wander || m.wanderT <= 0) {
            const r = m.homeRect;
            m.wander = r ? { x: r[0] + Math.random() * r[2], y: r[1] + Math.random() * r[3] } : { x: m.home.x + (Math.random() - 0.5) * 4, y: m.home.y + (Math.random() - 0.5) * 4 };
            m.wanderT = 2 + Math.random() * 3;
          }
          faceX = toScreen(m.wander.x - m.pos.x, m.wander.y - m.pos.y).sx;
          moving = this.stepToward(m, m.wander.x, m.wander.y, sp.speed * 0.4, dt) !== 0;
          break;
        }
        case 'chase': {
          const homeDist = Math.hypot(m.pos.x - m.home.x, m.pos.y - m.home.y);
          if (!targetable || (this.mode === 'world' && homeDist > leash)) {
            m.state = 'return';
            break;
          }
          faceX = toScreen(p.x - m.pos.x, p.y - m.pos.y).sx;
          if (sp.ranged && dist <= sp.ranged.range && m.rangedCd <= 0) {
            m.rangedCd = sp.ranged.interval;
            this.monsterShoot(m, { x: (p.x - m.pos.x) / dist, y: (p.y - m.pos.y) / dist }, sp.ranged.projectileSpeed, 0.7);
          }
          if (sp.behavior === 'charge' && m.specialCd <= 0 && dist > 2.5 && dist < 8) {
            m.state = 'dashWindup';
            m.stateT = 0.6;
            m.dashDir = { x: (p.x - m.pos.x) / dist, y: (p.y - m.pos.y) / dist };
            m.applyStateTint();
            break;
          }
          if (dist <= reach) {
            if (m.cd <= 0) {
              m.state = 'windup';
              m.stateT = 0.32;
              m.applyStateTint();
            }
          } else if (sp.behavior !== 'rooted') {
            moving = this.stepToward(m, p.x, p.y, sp.speed, dt) !== 0;
          }
          break;
        }
        case 'windup': {
          m.stateT -= dt;
          faceX = toScreen(p.x - m.pos.x, p.y - m.pos.y).sx;
          if (m.stateT <= 0) {
            if (targetable && dist <= reach + 0.5) this.damagePlayer(sp.atk, m.pos);
            m.cd = sp.attackInterval;
            m.state = 'chase';
            m.applyStateTint();
          }
          break;
        }
        case 'dashWindup': {
          m.stateT -= dt;
          if (m.stateT <= 0) {
            m.state = 'dash';
            m.stateT = 0.55;
            m.dashHit = false;
          }
          break;
        }
        case 'dash': {
          m.stateT -= dt;
          const sp3 = sp.speed * 3.4;
          this.level.move(m.pos, m.dashDir.x * sp3 * dt, m.dashDir.y * sp3 * dt, m.radius, this.monsterMask(m));
          faceX = toScreen(m.dashDir.x, m.dashDir.y).sx;
          moving = true;
          if (!m.dashHit && dist < m.radius + this.player.radius + 0.3) {
            m.dashHit = true;
            this.damagePlayer(sp.atk * 1.3, m.pos);
          }
          if (m.stateT <= 0) {
            m.state = 'chase';
            m.specialCd = 4 + Math.random() * 2;
            m.applyStateTint();
          }
          break;
        }
        case 'return': {
          faceX = toScreen(m.home.x - m.pos.x, m.home.y - m.pos.y).sx;
          moving = this.stepToward(m, m.home.x, m.home.y, Math.max(sp.speed, 2) * 1.3, dt) !== 0;
          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.5 * dt);
          if (Math.hypot(m.pos.x - m.home.x, m.pos.y - m.home.y) < 0.6 || sp.behavior === 'rooted') {
            m.state = 'idle';
            m.hp = m.maxHp;
          }
          break;
        }
      }
      m.update(dt, moving, faceX);
    }

    // 몬스터끼리 겹치지 않게 살짝 밀어낸다
    const live = this.monsters.filter((m) => m.alive && m.spec.behavior !== 'rooted' && m.spec.behavior !== 'object');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const min = (a.radius + b.radius) * 0.8;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < min) {
          const push = ((min - d) / d) * 0.25;
          this.level.move(a.pos, -dx * push, -dy * push, a.radius, this.monsterMask(a));
          this.level.move(b.pos, dx * push, dy * push, b.radius, this.monsterMask(b));
        }
      }
    }
    this.monsters = this.monsters.filter((m) => m.alive || m.sprite.active);
  }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.life -= dt;
      pr.pos.x += pr.vel.x * dt;
      pr.pos.y += pr.vel.y * dt;
      if (pr.life <= 0 || this.level.blocked(pr.pos.x, pr.pos.y, BLOCK_SHOT)) {
        pr.destroy();
        continue;
      }
      if (pr.owner === 'player') {
        for (const m of this.monsters) {
          if (!m.alive) continue;
          if (Math.hypot(m.pos.x - pr.pos.x, m.pos.y - pr.pos.y) < m.radius + pr.radius) {
            const { dmg, crit } = this.rollPlayerHit(m.spec.def);
            const len = Math.hypot(pr.vel.x, pr.vel.y) || 1;
            this.damageMonster(m, dmg, crit, { x: pr.vel.x / len, y: pr.vel.y / len });
            const s = toScreen(pr.pos.x, pr.pos.y);
            const spark = this.add.image(s.sx, s.sy - 14, 'fx_spark').setDepth(1e6);
            this.tweens.add({ targets: spark, alpha: 0, scale: 1.6, duration: 120, onComplete: () => spark.destroy() });
            pr.destroy();
            break;
          }
        }
      } else if (Math.hypot(this.player.pos.x - pr.pos.x, this.player.pos.y - pr.pos.y) < this.player.radius + pr.radius) {
        if (this.playerTargetable()) this.damagePlayer(pr.atk, pr.pos);
        pr.destroy();
        continue;
      }
      if (!pr.dead) pr.sync();
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private updateRespawns(dt: number) {
    for (const r of this.respawnQueue) r.t -= dt;
    const ready = this.respawnQueue.filter((r) => r.t <= 0);
    this.respawnQueue = this.respawnQueue.filter((r) => r.t > 0);
    for (const r of ready) this.spawnField(r.spawn);
  }

  private drawBars() {
    const g = this.bars;
    g.clear();
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const always = m.spec.tier === 'large' || m.spec.tier === 'manager' || m.spec.tier === 'boss' || m.spec.tier === 'object';
      if (!always && (m.sinceHurt > 4 || m.hp >= m.maxHp)) continue;
      const w = Math.max(14, Math.min(64, m.spec.sizePx * 0.7));
      const x = m.sprite.x - w / 2;
      const y = m.sprite.y - m.sprite.displayHeight * 0.92 - 4;
      g.fillStyle(0x000000, 0.8).fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(m.spec.tier === 'object' ? 0xc23cf0 : 0xff4060, 1).fillRect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 2);
    }
  }

  // ---------------- 지역·상호작용 ----------------
  private updateRegion(dt: number) {
    const p = this.player.pos;
    const region = this.level.regionAt(p.x, p.y);
    const safe = region?.kind === 'base';
    if (this.mode === 'world') store.setRuntime({ regionId: region?.id ?? '', regionName: region?.name ?? '', safe });

    // 체력 회복: 거점에서는 빠르게, 밖에서는 전투에서 벗어난 뒤 천천히
    const max = store.stats.maxHp;
    if (!this.player.dead && store.rt.hp < max) {
      const regen = safe
        ? CFG.player.baseRegenPerSec
        : this.player.sinceHit > CFG.player.outOfCombatDelay
          ? max * CFG.player.outOfCombatRegenPct
          : 0;
      if (regen) store.setHp(Math.min(max, store.rt.hp + regen * dt));
    }

    if (this.mode !== 'world') return;
    let interact: typeof store.rt.interact = null;
    const npc = DATA.world.npcs[store.faction];
    const tw = DATA.world.tower;
    if (Math.hypot(npc.x - p.x, npc.y - p.y) < 2) interact = { kind: 'npc', label: `${DATA.quests[store.faction].npc.name}와 대화` };
    else if (Math.hypot(tw.x - p.x, tw.y - p.y) < tw.radius) interact = { kind: 'tower', label: '탑 입장' };
    for (const pt of DATA.world.points) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (!this.exploreDone.has(pt.id) && d < pt.radius) {
        this.exploreDone.add(pt.id);
        store.toast(`지점 발견: ${pt.name}`, '#9be38f');
        store.questEvent({ type: 'explore', point: pt.id });
      }
      if (this.exploreDone.has(pt.id) && d > pt.radius + 6) this.exploreDone.delete(pt.id);
    }
    store.setRuntime({ interact });
  }
}
