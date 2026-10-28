import { C, Pix, shade } from './pix';

/** 32×16 아이소메트릭 마름모 바닥 타일 */
function diamond(seed: number, base: string, speckles: [string, number][], extra?: (p: Pix) => void): Pix {
  const p = new Pix(32, 16, seed);
  for (let y = 0; y < 16; y++) {
    const hw = y < 8 ? (y + 1) * 2 : (16 - y) * 2;
    for (let x = 16 - hw; x < 16 + hw; x++) {
      let c = base;
      const r = p.rand();
      let acc = 0;
      for (const [sc, prob] of speckles) {
        acc += prob;
        if (r < acc) {
          c = sc;
          break;
        }
      }
      p.px(x, y, c);
    }
  }
  extra?.(p);
  return p;
}

function inDiamond(x: number, y: number): boolean {
  return Math.abs(x - 15.5) / 16 + Math.abs(y - 7.5) / 8 <= 1;
}

export const TILE_TYPES = ['void', 'jungle', 'sand', 'shallow', 'deepwater', 'metal', 'flesh', 'towerstone', 'towerfloor'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export const TILE_VARIANTS = 3;

export function paintTile(type: TileType, v: number): Pix | null {
  const seed = TILE_TYPES.indexOf(type) * 10 + v + 1;
  switch (type) {
    case 'void':
      return null;
    case 'jungle':
      return diamond(seed, '#2c4422', [['#3a5a2a', 0.18], ['#22361a', 0.18], ['#6a3488', v === 2 ? 0.02 : 0.006]]);
    case 'sand':
      return diamond(seed, '#a89c84', [['#968a72', 0.2], ['#bcb098', 0.14], ['#8a5a9a', v === 1 ? 0.02 : 0.004]]);
    case 'shallow':
      return diamond(seed, '#3a6474', [['#467888', 0.18], ['#305462', 0.12], ['#9ad0e0', 0.02]]);
    case 'deepwater':
      return diamond(seed, '#122a36', [['#183644', 0.2], ['#0e222c', 0.15]], (p) => {
        for (let i = 0; i < 2; i++) {
          const y = 4 + i * 6 + v;
          for (let x = 8; x < 24; x++) if (inDiamond(x, y) && (x + v) % 6 < 3) p.px(x, y, '#2a5466');
        }
        if (v === 0) p.px(16, 8, C.vein);
      });
    case 'metal':
      return diamond(seed, '#4a5262', [['#444b5a', 0.2]], (p) => {
        for (let x = 0; x < 32; x++) {
          const y = Math.round(7.5 - (x - 15.5) / 2);
          if (inDiamond(x, y)) p.px(x, y, '#363c48');
        }
        p.px(16, 4, '#8a94a8');
        p.px(16, 11, '#8a94a8');
      });
    case 'flesh':
      return diamond(seed, '#4e2430', [['#62303c', 0.2], ['#3e1a24', 0.15]], (p) => {
        let x = 6 + v * 3;
        let y = 7;
        for (let i = 0; i < 14; i++) {
          if (inDiamond(x, y)) p.px(x, y, i % 4 ? '#8a3a6a' : C.vein);
          x++;
          y += p.rand() < 0.5 ? 0 : p.rand() < 0.5 ? 1 : -1;
        }
      });
    case 'towerstone':
      return diamond(seed, '#2a2236', [['#352c44', 0.2], ['#221c2c', 0.15], ['#7a44b0', 0.01]]);
    case 'towerfloor':
      return diamond(seed, '#1e1c2a', [['#262434', 0.25]], (p) => {
        for (let x = 0; x < 32; x++) {
          const y1 = Math.round(7.5 - (x - 15.5) / 2);
          const y2 = Math.round(7.5 + (x - 15.5) / 2);
          if (inDiamond(x, y1)) p.px(x, y1, '#34304a');
          if (inDiamond(x, y2)) p.px(x, y2, '#34304a');
        }
        if (v === 1) p.px(16, 8, '#8a54d0');
      });
  }
}

/** 아이소메트릭 벽 블록 (윗면 + 좌우 면) */
export function paintBlock(top: string, left: string, right: string, height: number, glow?: string): Pix {
  const p = new Pix(32, 16 + height, height * 3);
  for (let x = 0; x < 32; x++) {
    const edge = x < 16 ? 8 + Math.floor(x / 2) : 16 - Math.floor((x - 16) / 2);
    for (let y = edge; y < edge + height; y++) p.px(x, y, x < 16 ? left : right);
    if (glow && x % 7 === 3) p.px(x, edge + Math.floor(height / 2), glow);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (inDiamond(x, y)) p.px(x, y, top);
  for (let x = 0; x < 32; x++) {
    const y = x < 16 ? 8 - Math.floor(x / 2) : Math.floor((x - 16) / 2);
    p.px(x, y, shade(top, 0.12));
  }
  return p;
}

/** 오염된 정글 나무: 뒤틀린 줄기, 보라색으로 빛나는 꼬투리, 결정 */
export function paintTree(v: number): Pix {
  const p = new Pix(30, 46, 40 + v);
  p.ellipse(15, 43, 9, 3, '#000000', 0.35);
  p.path([[15, 44], [13 + v, 34], [16, 26], [14, 18]], '#3a2a20', 4);
  p.path([[14, 30], [8, 24]], '#3a2a20', 2);
  p.blob(14, 14, 12, 9, '#2a4a20', '#18301a', '#3e6a2a');
  p.blob(7, 20, 6, 5, '#2a4a20', '#18301a', '#3e6a2a');
  p.blob(22, 19, 6, 5, '#2a4a20', '#18301a', '#3e6a2a');
  for (const [x, y] of [[9, 14], [19, 10], [23, 21], [6, 22], [15, 18]]) p.glow(x! + v, y!, 0.8, C.veinGlow, C.vein);
  if (v !== 1) p.crystal(18, 43, 6, 0.4);
  p.outline();
  return p;
}

/** 탑 입구의 거대한 탑 (화면 위로 뻗어 나간다) */
export function paintTower(): Pix {
  const w = 110;
  const h = 230;
  const p = new Pix(w, h, 77);
  for (let y = 0; y < h - 20; y++) {
    const t = y / (h - 20);
    const hw = 10 + t * 40;
    p.rect(w / 2 - hw, y, hw, 1, '#1a1424');
    p.rect(w / 2, y, hw, 1, '#120e1a');
    if (y % 18 === 0) p.rect(w / 2 - hw, y, hw * 2, 1, '#2e2440');
  }
  for (let i = 0; i < 9; i++) {
    const y = 20 + i * 22;
    p.line(w / 2 - 3, y, w / 2 + 4, y + 10, C.vein);
    p.px(w / 2 + 1, y + 5, C.veinGlow);
  }
  p.ellipse(w / 2, h - 26, 52, 16, '#120e1a');
  p.ellipse(w / 2, h - 30, 12, 18, '#000000');
  p.ellipse(w / 2, h - 30, 9, 15, '#4a1a6a', 0.9);
  p.ellipse(w / 2, h - 30, 5, 10, C.veinGlow, 0.6);
  p.crystal(w / 2 - 34, h - 22, 18, -0.4);
  p.crystal(w / 2 + 34, h - 24, 22, 0.4);
  p.crystal(w / 2, 6, 10, 0);
  p.outline();
  return p;
}

export function paintShadow(rx: number): Pix {
  const w = Math.ceil(rx * 2) + 2;
  const h = Math.ceil(rx) + 2;
  const p = new Pix(w, h);
  p.ellipse(w / 2, h / 2, rx, rx / 2, '#000000', 0.38);
  return p;
}

export function paintFx() {
  const bolt = new Pix(10, 5);
  bolt.rect(0, 1, 10, 3, '#2ab8ff', 0.6);
  bolt.rect(2, 2, 8, 1, '#c8fcff');
  const spit = new Pix(7, 7);
  spit.ellipse(3.5, 3.5, 3.5, 3.5, C.vein);
  spit.ellipse(3, 3, 1.5, 1.5, C.veinGlow);
  const orb = new Pix(9, 9);
  orb.ellipse(4.5, 4.5, 4.5, 4.5, '#ff4060', 0.6);
  orb.ellipse(4.5, 4.5, 2.5, 2.5, '#ffe0e8');
  const slash = new Pix(40, 24);
  for (let a = -1.2; a <= 1.2; a += 0.02) {
    for (let r = 13; r < 19; r++) {
      const x = 20 + Math.cos(a) * r;
      const y = 12 + Math.sin(a) * r * 0.6;
      slash.px(x, y, r > 16 ? '#ff9cff' : '#ffffff', 1 - Math.abs(a) / 1.6);
    }
  }
  const spark = new Pix(9, 9);
  spark.line(0, 4, 8, 4, '#ffffff');
  spark.line(4, 0, 4, 8, '#ffffff');
  spark.px(4, 4, '#ffe066');
  // 탑 미션 오브젝트
  const pylon = new Pix(18, 32, 5);
  pylon.rect(4, 26, 10, 5, '#2a2236');
  pylon.crystal(9, 27, 24, 0);
  pylon.crystal(6, 27, 12, -0.4);
  pylon.crystal(12, 27, 14, 0.4);
  pylon.glow(9, 14, 2, '#ff9cff', C.vein);
  pylon.outline();
  const shard = new Pix(12, 14, 6);
  shard.ellipse(6, 11, 5, 2.5, '#000000', 0.3);
  shard.crystal(6, 11, 10, 0.2);
  shard.glow(6, 6, 1.5, '#ffffff', C.veinGlow);
  shard.outline();
  const portal = new Pix(34, 22, 8);
  portal.ellipse(17, 11, 16, 9, '#2a0a3a');
  portal.ellipse(17, 11, 12, 6.5, C.vein, 0.8);
  portal.ellipse(17, 11, 7, 3.5, C.veinGlow, 0.8);
  portal.ellipse(17, 11, 3, 1.5, '#ffffff');
  const barrier = new Pix(32, 30, 9);
  for (let x = 0; x < 32; x++) {
    const edge = x < 16 ? 8 + Math.floor(x / 2) : 16 - Math.floor((x - 16) / 2);
    for (let y = edge - 6; y < edge + 14; y++) barrier.px(x, y, (x + y) % 4 === 0 ? '#ff6080' : '#c02040', 0.45);
  }
  return { bolt, spit, orb, slash, spark, pylon, shard, portal, barrier };
}
