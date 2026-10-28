import { CFG } from './data';

export const HALF_W = CFG.display.tileWidth / 2;
export const HALF_H = CFG.display.tileHeight / 2;

/** 타일 좌표(연속값) → 화면 좌표. 타일 (i,j)의 마름모 꼭대기가 toScreen(i,j). */
export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * HALF_W, sy: (x + y) * HALF_H };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** 화면 기준 방향(위=−y)을 타일 좌표 방향으로 바꿔 정규화한다. */
export function screenDirToWorld(dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const w = toWorld(dx, dy);
  const len = Math.hypot(w.x, w.y);
  return { x: w.x / len, y: w.y / len };
}

export function depthOf(x: number, y: number): number {
  return (x + y) * HALF_H;
}
