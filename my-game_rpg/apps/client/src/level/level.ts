import type { Faction } from '@tb/shared';
import type { TileType } from '../gfx/tiles';

/** 이동 차단 비트 */
export const BLOCK_WALK = 1;
/** 투사체 차단 비트 */
export const BLOCK_SHOT = 2;
/** 몬스터 진입 차단 비트 (안전지대 등) */
export const BLOCK_MON = 4;
export const BLOCK_ALL = BLOCK_WALK | BLOCK_SHOT | BLOCK_MON;

export interface LevelRegion {
  id: string;
  name: string;
  kind: 'base' | 'field' | 'hub' | 'tower';
  contamination: number;
  faction?: Faction;
}

export interface Prop {
  key: string;
  /** 타일 좌표 (발 위치) */
  x: number;
  y: number;
  /** 텍스처 원점 y (기본 1 = 바닥) */
  originY?: number;
  /** 깊이 보정 */
  depthBias?: number;
}

export class Level {
  readonly tiles: TileType[];
  readonly flags: Uint8Array;
  readonly regionIdx: Int16Array;
  readonly regions: LevelRegion[] = [];
  readonly props: Prop[] = [];
  spawn = { x: 1, y: 1 };

  constructor(
    readonly kind: 'world' | 'tower',
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = new Array<TileType>(w * h).fill('void');
    this.flags = new Uint8Array(w * h).fill(BLOCK_ALL);
    this.regionIdx = new Int16Array(w * h).fill(-1);
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  idx(x: number, y: number) {
    return y * this.w + x;
  }

  setTile(x: number, y: number, tile: TileType, flags: number, region = -1) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.tiles[i] = tile;
    this.flags[i] = flags;
    if (region >= 0) this.regionIdx[i] = region;
  }

  addFlag(x: number, y: number, f: number) {
    if (this.inBounds(x, y)) this.flags[this.idx(x, y)]! |= f;
  }

  blocked(x: number, y: number, mask: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return true;
    return (this.flags[this.idx(tx, ty)]! & mask) !== 0;
  }

  regionAt(x: number, y: number): LevelRegion | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return null;
    const r = this.regionIdx[this.idx(tx, ty)]!;
    return r >= 0 ? this.regions[r]! : null;
  }

  /** 원(반지름 r)이 막힌 칸과 겹치는지 */
  circleBlocked(x: number, y: number, r: number, mask: number): boolean {
    return (
      this.blocked(x - r, y - r, mask) ||
      this.blocked(x + r, y - r, mask) ||
      this.blocked(x - r, y + r, mask) ||
      this.blocked(x + r, y + r, mask)
    );
  }

  /** 축별로 나눠 이동해 벽을 따라 미끄러지게 한다. */
  move(pos: { x: number; y: number }, dx: number, dy: number, r: number, mask: number) {
    if (dx && !this.circleBlocked(pos.x + dx, pos.y, r, mask)) pos.x += dx;
    if (dy && !this.circleBlocked(pos.x, pos.y + dy, r, mask)) pos.y += dy;
  }

  /** 사각형 안에서 걸을 수 있는 무작위 칸 중앙 */
  randomOpenIn(rect: [number, number, number, number], mask: number, rand: () => number = Math.random): { x: number; y: number } | null {
    const [rx, ry, rw, rh] = rect;
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rx + rand() * rw);
      const y = Math.floor(ry + rand() * rh);
      if (!this.circleBlocked(x + 0.5, y + 0.5, 0.45, mask)) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }
}
