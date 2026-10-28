import type Phaser from 'phaser';
import type { FloorDef } from '@tb/shared';
import { DATA } from '../core/data';
import { toScreen, depthOf } from '../core/iso';
import { mulberry32 } from '../core/rng';
import { store } from '../core/store';
import { specFromDef, specFromManager, type Monster, type MonsterSpec } from '../entities/Monster';
import type { PlayScene } from '../scenes/PlayScene';
import { BLOCK_ALL, Level } from './level';

const MISSION_LABEL = { hunt: '사냥형', maze: '미궁형', quest: '퀘스트형', boss: '보스전' } as const;

function wall(lv: Level, x: number, y: number) {
  lv.setTile(x, y, 'towerfloor', BLOCK_ALL, 0);
  lv.props.push({ key: 'wall_tower', x: x + 1, y: y + 1, originY: 1, depthBias: -4 });
}

/** 사냥형·퀘스트형·보스전용 원형 경기장 */
function buildArena(size: number): Level {
  const lv = new Level('tower', size, size);
  lv.regions.push({ id: 'tower', name: '탑', kind: 'tower', contamination: 0 });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (edge) wall(lv, x, y);
      else lv.setTile(x, y, 'towerfloor', 0, 0);
    }
  const q = Math.floor(size / 4);
  for (const [px, py] of [[q, q], [size - q - 2, q], [q, size - q - 2], [size - q - 2, size - q - 2]]) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) wall(lv, px! + dx, py! + dy);
  }
  lv.spawn = { x: 3.5, y: size / 2 };
  return lv;
}

export interface MazeInfo {
  level: Level;
  exitRoom: [number, number, number, number];
  cellCenters: { x: number; y: number }[];
}

/** 시드 고정 DFS 미로. 칸 하나는 2×2 타일, 벽은 1타일. 마지막 2×2칸은 관리자 방. */
export function buildMaze(cw: number, ch: number, seed: number): MazeInfo {
  const W = cw * 3 + 1;
  const H = ch * 3 + 1;
  const lv = new Level('tower', W, H);
  lv.regions.push({ id: 'tower', name: '탑', kind: 'tower', contamination: 0 });
  const open = new Uint8Array(W * H);
  const carve = (x: number, y: number) => (open[y * W + x] = 1);
  const rand = mulberry32(seed * 7919 + 13);
  const seen = new Uint8Array(cw * ch);
  const stack: [number, number][] = [[0, 0]];
  seen[0] = 1;
  const cellOrigin = (cx: number, cy: number) => [1 + cx * 3, 1 + cy * 3] as const;
  const carveCell = (cx: number, cy: number) => {
    const [ox, oy] = cellOrigin(cx, cy);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) carve(ox + dx, oy + dy);
  };
  carveCell(0, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]!;
    const nbrs = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy] as const)
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen[ny * cw + nx]);
    if (!nbrs.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = nbrs[Math.floor(rand() * nbrs.length)]!;
    seen[ny * cw + nx] = 1;
    carveCell(nx, ny);
    const [ox, oy] = cellOrigin(cx, cy);
    // 두 칸 사이 벽을 2타일 폭으로 뚫는다
    if (dx === 1) for (let k = 0; k < 2; k++) carve(ox + 2, oy + k);
    if (dx === -1) for (let k = 0; k < 2; k++) carve(ox - 1, oy + k);
    if (dy === 1) for (let k = 0; k < 2; k++) carve(ox + k, oy + 2);
    if (dy === -1) for (let k = 0; k < 2; k++) carve(ox + k, oy - 1);
    stack.push([nx, ny]);
  }
  // 관리자 방: 마지막 2×2칸 전체를 연다
  const [rx, ry] = cellOrigin(cw - 2, ch - 2);
  const room: [number, number, number, number] = [rx, ry, 5, 5];
  for (let y = ry; y < ry + 5; y++) for (let x = rx; x < rx + 5; x++) carve(x, y);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (open[y * W + x]) lv.setTile(x, y, 'towerfloor', 0, 0);
      else wall(lv, x, y);
    }
  const cellCenters: { x: number; y: number }[] = [];
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      const [ox, oy] = cellOrigin(cx, cy);
      cellCenters.push({ x: ox + 1, y: oy + 1 });
    }
  lv.spawn = { x: 2, y: 2 };
  return { level: lv, exitRoom: room, cellCenters };
}

/** 층 미션 진행. 모든 유형은 관리자 격파로 끝난다. */
export class TowerMission {
  readonly fl: FloorDef;
  phase: 'pre' | 'manager' | 'cleared' | 'failed' = 'pre';
  manager: Monster | null = null;
  portal: { x: number; y: number } | null = null;
  private wave = 0;
  private timer = 0;
  private spawnT = 0;
  private objectives: Monster[] = [];
  private shards: { x: number; y: number; img: Phaser.GameObjects.Image }[] = [];
  private collected = 0;
  private destroyed = 0;
  private maze: MazeInfo | null = null;
  private minions = new Set<Monster>();

  constructor(
    readonly scene: PlayScene,
    readonly floor: number,
  ) {
    this.fl = DATA.tower.floors.find((f) => f.floor === floor)!;
  }

  buildLevel(): Level {
    const m = this.fl.mission;
    if (m.type === 'maze') {
      this.maze = buildMaze(m.cellsW, m.cellsH, m.seed);
      return this.maze.level;
    }
    return buildArena(m.type === 'boss' ? 26 : 24);
  }

  minionSpec(id: string): MonsterSpec {
    return specFromDef(DATA.monsters.get(id)!, this.fl.monsterScale, 'tower');
  }

  spawnMinion(id: string, x: number, y: number, aggro = 30) {
    const spec = { ...this.minionSpec(id), aggroRange: aggro };
    const lv = this.scene.level;
    const at = lv.randomOpenIn([Math.floor(x) - 1, Math.floor(y) - 1, 3, 3], BLOCK_ALL) ?? { x, y };
    const mon = this.scene.spawnMonster(spec, at.x, at.y);
    this.minions.add(mon);
    return mon;
  }

  start() {
    const m = this.fl.mission;
    const lv = this.scene.level;
    if (m.type === 'hunt') this.spawnWave();
    else if (m.type === 'maze') {
      this.timer = m.timeLimit;
      const cells = this.maze!.cellCenters.filter((c) => c.x + c.y > 8 && !this.inExitRoom(c.x, c.y));
      const rand = mulberry32(m.seed);
      for (const g of m.monsters)
        for (let i = 0; i < g.count; i++) {
          const c = cells[Math.floor(rand() * cells.length)]!;
          this.spawnMinion(g.monster, c.x, c.y, DATA.monsters.get(g.monster)!.aggroRange);
        }
      const [rx, ry, rw, rh] = this.maze!.exitRoom;
      this.manager = this.scene.spawnMonster({ ...specFromManager(this.fl), aggroRange: 0.01 }, rx + rw / 2, ry + rh / 2);
      const s = toScreen(rx + rw / 2, ry + rh / 2);
      this.scene.add.image(s.sx, s.sy, 'fx_portal').setDepth(depthOf(rx, ry) - 50).setAlpha(0.6);
    } else if (m.type === 'quest') {
      const c = lv.w / 2;
      // 기둥(2×2)과 겹치지 않는 자리. 막힌 칸이면 주변 빈칸으로 옮긴다
      const spots = [
        [c - 4, c - 4], [c + 3, c - 4], [c - 4, c + 3], [c + 3, c + 3], [c, c - 7], [c, c + 7], [c - 7, c], [c + 7, c],
      ];
      const o = m.objective;
      for (let i = 0; i < o.count; i++) {
        let [x, y] = spots[i % spots.length]!;
        if (lv.circleBlocked(x! + 0.5, y! + 0.5, 0.5, BLOCK_ALL)) {
          const alt = lv.randomOpenIn([x! - 2, y! - 2, 5, 5], BLOCK_ALL);
          if (alt) [x, y] = [alt.x - 0.5, alt.y - 0.5];
        }
        if (o.kind === 'destroy') {
          const spec: MonsterSpec = {
            texture: 'obj_pylon', name: o.label, tier: 'object', sizePx: 32, hp: o.hp ?? 80, atk: 0, def: 0, speed: 0,
            aggroRange: 1, attackRange: 1, attackInterval: 99, behavior: 'object', primaryPart: 'all', dropArea: 'tower',
          };
          this.objectives.push(this.scene.spawnMonster(spec, x! + 0.5, y! + 0.5));
        } else {
          const s = toScreen(x! + 0.5, y! + 0.5);
          const img = this.scene.add.image(s.sx, s.sy, 'fx_shard').setOrigin(0.5, 0.85).setDepth(depthOf(x!, y!));
          this.scene.tweens.add({ targets: img, y: s.sy - 3, yoyo: true, repeat: -1, duration: 600 });
          this.shards.push({ x: x! + 0.5, y: y! + 0.5, img });
        }
      }
      this.spawnT = 1;
    } else {
      this.spawnManager();
    }
    store.toast(`${this.fl.floor}층 ${this.fl.theme} — ${this.fl.manager.name}`, this.fl.manager.color);
  }

  private inExitRoom(x: number, y: number) {
    if (!this.maze) return false;
    const [rx, ry, rw, rh] = this.maze.exitRoom;
    return x >= rx && y >= ry && x < rx + rw && y < ry + rh;
  }

  private spawnWave() {
    const m = this.fl.mission;
    if (m.type !== 'hunt') return;
    const lv = this.scene.level;
    const group = m.waves[this.wave]!;
    const c = lv.w / 2;
    let i = 0;
    for (const g of group)
      for (let k = 0; k < g.count; k++, i++) {
        const a = (i / 8) * Math.PI * 2;
        this.spawnMinion(g.monster, c + 3 + Math.cos(a) * 6, c + Math.sin(a) * 6);
      }
    store.toast(`웨이브 ${this.wave + 1} / ${m.waves.length}`, '#ff9cff');
  }

  spawnManager() {
    const lv = this.scene.level;
    const x = lv.w - 5;
    const y = lv.h / 2;
    this.manager = this.scene.spawnMonster(specFromManager(this.fl), x, y);
    this.manager.wanderT = 4;
    this.phase = 'manager';
    const s = toScreen(x, y);
    const fx = this.scene.add.image(s.sx, s.sy - 20, 'fx_portal').setDepth(1e5).setScale(2);
    this.scene.tweens.add({ targets: fx, alpha: 0, scale: 3, duration: 700, onComplete: () => fx.destroy() });
    store.toast(`관리자 등장: ${this.fl.manager.name}`, this.fl.manager.color);
  }

  aliveMinions() {
    let n = 0;
    for (const m of this.minions) if (m.alive) n++;
    return n;
  }

  onKill(m: Monster) {
    this.minions.delete(m);
    if (this.objectives.includes(m)) {
      this.destroyed++;
      store.toast(`${this.fl.mission.type === 'quest' ? this.fl.mission.objective.label : ''} 파괴 (${this.destroyed}/${this.objectives.length})`, '#ff9cff');
    }
    if (m === this.manager) this.clear();
  }

  private clear() {
    if (this.phase === 'cleared') return;
    this.phase = 'cleared';
    for (const mm of this.minions) if (mm.alive) this.scene.damageMonster(mm, mm.hp, false);
    const firstTime = this.floor > store.save!.tower.highestCleared;
    store.towerCleared(this.floor);
    store.toast(`${this.floor}층 클리어!${firstTime ? ' 다음 층이 열렸습니다.' : ''}`, '#ffd166');
    const p = this.scene.player.pos;
    this.portal = { x: p.x + 1.5, y: p.y };
    const lv = this.scene.level;
    if (lv.circleBlocked(this.portal.x, this.portal.y, 0.6, BLOCK_ALL)) this.portal = { x: p.x, y: p.y };
    const s = toScreen(this.portal.x, this.portal.y);
    const img = this.scene.add.image(s.sx, s.sy, 'fx_portal').setDepth(depthOf(this.portal.x, this.portal.y) - 1);
    this.scene.tweens.add({ targets: img, alpha: 0.6, yoyo: true, repeat: -1, duration: 500 });
  }

  update(dt: number) {
    const m = this.fl.mission;
    const p = this.scene.player.pos;
    if (this.phase === 'pre') {
      if (m.type === 'hunt' && this.aliveMinions() === 0) {
        this.wave++;
        if (this.wave < m.waves.length) this.spawnWave();
        else this.spawnManager();
      } else if (m.type === 'maze') {
        this.timer -= dt;
        if (this.inExitRoom(p.x, p.y)) {
          this.phase = 'manager';
          if (this.manager) this.manager.spec.aggroRange = 30;
          store.toast(`관리자의 방 도달! ${this.fl.manager.name}을(를) 쓰러뜨리세요`, this.fl.manager.color);
        } else if (this.timer <= 0) this.fail('제한 시간 초과');
      } else if (m.type === 'quest') {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.aliveMinions() < m.maxAlive) {
          this.spawnT = m.spawnInterval;
          const lv = this.scene.level;
          for (const g of m.monsters)
            for (let i = 0; i < g.count; i++) this.spawnMinion(g.monster, lv.w - 4, 3 + Math.random() * (lv.h - 6));
        }
        for (const s of this.shards) {
          if (s.img.active && Math.hypot(s.x - p.x, s.y - p.y) < 0.9) {
            s.img.destroy();
            this.collected++;
            store.toast(`${m.objective.label} 획득 (${this.collected}/${m.objective.count})`, '#ff9cff');
          }
        }
        const done = m.objective.kind === 'destroy' ? this.destroyed >= m.objective.count : this.collected >= m.objective.count;
        if (done) {
          store.toast('과제 완료! 관리자가 직접 나섭니다', '#ffd166');
          this.spawnManager();
        }
      }
    }

    // 미궁형 관리자 방에서는 제한 시간이 멈춘다
    store.setRuntime({ mission: { title: `${this.floor}층 ${this.fl.theme} · ${MISSION_LABEL[m.type]}`, detail: this.detail(), timer: m.type === 'maze' && this.phase === 'pre' ? Math.max(0, Math.ceil(this.timer)) : undefined } });

    let interact: typeof store.rt.interact = null;
    if (this.portal && Math.hypot(this.portal.x - p.x, this.portal.y - p.y) < 1.6) interact = { kind: 'exit', label: '탑 나가기' };
    store.setRuntime({ interact });
  }

  private detail(): string {
    const m = this.fl.mission;
    if (this.phase === 'cleared') return '— 클리어! 포탈로 탑을 나가세요';
    if (this.phase === 'manager' && this.manager) return `— ${this.fl.manager.name} 체력 ${Math.max(0, Math.ceil((this.manager.hp / this.manager.maxHp) * 100))}%`;
    if (m.type === 'hunt') return `— 웨이브 ${this.wave + 1}/${m.waves.length} · 남은 적 ${this.aliveMinions()}`;
    if (m.type === 'maze') return '— 미로를 지나 관리자의 방(남동쪽 끝)에 도달';
    if (m.type === 'quest') {
      const n = m.objective.kind === 'destroy' ? this.destroyed : this.collected;
      return `— ${m.objective.label} ${m.objective.kind === 'destroy' ? '파괴' : '수집'} ${n}/${m.objective.count}`;
    }
    return '';
  }

  private fail(reason: string) {
    this.phase = 'failed';
    store.toast(`${this.floor}층 실패: ${reason}. 강화 수치 손실 없이 탑을 나갑니다.`, '#ff8a9a');
    this.scene.goWorld();
  }

  /** 관리자 행동 패턴. true면 기본 AI 대신 처리한 것 */
  managerAI(mon: Monster, dt: number, dist: number): boolean {
    if (mon !== this.manager) return false;
    const handled = this.managerStep(mon, dt, dist);
    // 미궁형 관리자는 자기 방을 벗어나지 않는다 (미로 벽에 걸리지 않게)
    if (this.maze) {
      const [rx, ry, rw, rh] = this.maze.exitRoom;
      const r = mon.radius;
      mon.pos.x = Math.min(rx + rw - r, Math.max(rx + r, mon.pos.x));
      mon.pos.y = Math.min(ry + rh - r, Math.max(ry + r, mon.pos.y));
    }
    return handled;
  }

  private managerStep(mon: Monster, dt: number, dist: number): boolean {
    if (mon.spec.aggroRange < 1) return true; // 미궁형: 방에 들어오기 전엔 대기
    const sc = this.scene;
    const p = sc.player.pos;
    const pattern = mon.spec.pattern!;
    const enraged = mon.hp < mon.maxHp * 0.5;
    const speedK = enraged ? 1.25 : 1;
    const dir = { x: (p.x - mon.pos.x) / (dist || 1), y: (p.y - mon.pos.y) / (dist || 1) };
    const reach = mon.spec.attackRange + mon.radius * 0.6 + sc.player.radius;

    // 돌진 진행 중
    if (mon.state === 'dashWindup' || mon.state === 'dash') {
      mon.stateT -= dt;
      if (mon.state === 'dashWindup' && mon.stateT <= 0) {
        mon.state = 'dash';
        mon.stateT = 0.5;
        mon.dashHit = false;
        mon.applyStateTint();
      } else if (mon.state === 'dash') {
        const v = mon.spec.speed * 4;
        sc.level.move(mon.pos, mon.dashDir.x * v * dt, mon.dashDir.y * v * dt, mon.radius, BLOCK_ALL);
        if (!mon.dashHit && dist < mon.radius + sc.player.radius + 0.3) {
          mon.dashHit = true;
          sc.damagePlayer(mon.spec.atk * 1.4, mon.pos);
        }
        if (mon.stateT <= 0) {
          mon.state = 'chase';
          mon.applyStateTint();
        }
      }
      return true;
    }
    if (mon.state === 'windup') {
      mon.stateT -= dt;
      if (mon.stateT <= 0) {
        if (dist <= reach + 0.5) sc.damagePlayer(mon.spec.atk, mon.pos);
        mon.cd = mon.spec.attackInterval;
        mon.state = 'chase';
        mon.applyStateTint();
      }
      return true;
    }
    mon.state = 'chase';

    // 이동: 사격·소환형은 거리를 유지, 돌진형·보스는 다가간다
    const keep = pattern === 'shooter' || pattern === 'summoner' ? 4.5 : 0;
    const spd = mon.spec.speed * speedK;
    if (keep && dist < keep - 1) sc.level.move(mon.pos, -dir.x * spd * dt, -dir.y * spd * dt, mon.radius, BLOCK_ALL);
    else if (dist > (keep || reach)) sc.level.move(mon.pos, dir.x * spd * dt, dir.y * spd * dt, mon.radius, BLOCK_ALL);

    if (dist <= reach && mon.cd <= 0) {
      mon.state = 'windup';
      mon.stateT = 0.35;
      mon.applyStateTint();
      return true;
    }

    // 원거리 탄막
    if ((pattern === 'shooter' || pattern === 'summoner' || pattern === 'boss') && mon.rangedCd <= 0) {
      const n = pattern === 'boss' ? (enraged ? 12 : 8) : pattern === 'shooter' ? 3 : 1;
      const spread = pattern === 'boss' ? Math.PI * 2 : 0.5;
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < n; i++) {
        const a = pattern === 'boss' ? base + (i / n) * spread : base + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1));
        sc.monsterShoot(mon, { x: Math.cos(a), y: Math.sin(a) }, 6, 0.7, 'fx_orb');
      }
      mon.rangedCd = (pattern === 'boss' ? 2.6 : 1.9) / speedK;
    }
    // 돌진
    if ((pattern === 'charger' || pattern === 'boss') && mon.specialCd <= 0 && dist > 2 && dist < 9) {
      mon.state = 'dashWindup';
      mon.stateT = 0.6;
      mon.dashDir = dir;
      mon.specialCd = (pattern === 'boss' ? 5 : 3.5) / speedK;
      mon.applyStateTint();
      return true;
    }
    // 소환
    if (pattern === 'summoner' || pattern === 'boss') {
      mon.wanderT -= dt;
      if (mon.wanderT <= 0 && this.aliveMinions() < 8) {
        mon.wanderT = pattern === 'boss' ? 10 : 8;
        const m = this.fl.mission;
        const pool = m.type === 'boss' ? m.summon : m.type === 'hunt' ? m.waves.flat() : m.type === 'maze' || m.type === 'quest' ? m.monsters : [];
        const pick = pool.slice(0, 2);
        for (const g of pick) this.spawnMinion(g.monster, mon.pos.x + (Math.random() - 0.5) * 3, mon.pos.y + (Math.random() - 0.5) * 3);
        store.toast(`${this.fl.manager.name}: 하수인 소환`, this.fl.manager.color);
      }
    }
    return true;
  }
}
