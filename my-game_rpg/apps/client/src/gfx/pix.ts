import { mulberry32 } from '../core/rng';

/** 오염 표식 공통 색 (PRD 8장): 자홍빛 보라 혈관과 검은 결정 */
export const C = {
  outline: '#0d0a12',
  vein: '#c23cf0',
  veinGlow: '#ff7cff',
  crystal: '#1b1226',
  crystalMid: '#3a2654',
  crystalHi: '#8a64c8',
  bone: '#e8dcc0',
  boneDark: '#a89878',
  flesh: '#b0505a',
  fleshDark: '#6a2430',
  white: '#f4f0ff',
};

/** 픽셀 단위로 그리는 작은 캔버스 도우미. */
export class Pix {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly rand: () => number;

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
    this.rand = mulberry32(seed);
  }

  px(x: number, y: number, c: string, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, 1, 1);
    this.ctx.globalAlpha = 1;
  }

  rect(x: number, y: number, w: number, h: number, c: string, alpha = 1) {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.globalAlpha = 1;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string, alpha = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, alpha);
      }
    }
  }

  /** 위쪽에서 빛을 받는 듯한 3단 음영 타원 */
  blob(cx: number, cy: number, rx: number, ry: number, base: string, dark: string, light: string) {
    this.ellipse(cx, cy, rx, ry, dark);
    this.ellipse(cx - rx * 0.12, cy - ry * 0.15, rx * 0.85, ry * 0.78, base);
    this.ellipse(cx - rx * 0.35, cy - ry * 0.45, Math.max(1, rx * 0.3), Math.max(1, ry * 0.22), light);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (thick <= 1) this.px(x, y, c);
      else this.rect(x - thick / 2, y - thick / 2, thick, thick, c);
    }
  }

  /** 여러 점을 잇는 다리·촉수 */
  path(points: [number, number][], c: string, thick = 1) {
    for (let i = 1; i < points.length; i++) this.line(points[i - 1]![0], points[i - 1]![1], points[i]![0], points[i]![1], c, thick);
  }

  /** 살을 뚫고 자란 검은 결정 (끝이 뾰족한 조각) */
  crystal(x: number, y: number, h: number, lean = 0) {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const w = Math.max(1, Math.round((1 - t) * 2.5));
      const cx = x + lean * t * h * 0.5;
      this.rect(cx - w / 2, y - i, w, 1, i === h - 1 ? C.crystalHi : C.crystal);
      if (w >= 2) this.px(cx - w / 2, y - i, C.crystalMid);
    }
    this.px(x + lean * 0.4 * h * 0.5, y - h + 1, C.crystalHi);
    this.px(x, y - Math.floor(h / 2), C.veinGlow, 0.8);
  }

  isOpaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.ctx.getImageData(x, y, 1, 1).data[3]! > 0;
  }

  /** 이미 칠해진 몸 위에만 보라색 혈관을 그린다 (오염 표식). */
  veins(count: number, len: number, area?: [number, number, number, number]) {
    const [ax, ay, aw, ah] = area ?? [0, 0, this.w, this.h];
    for (let n = 0; n < count; n++) {
      let x = Math.floor(ax + this.rand() * aw);
      let y = Math.floor(ay + this.rand() * ah);
      let tries = 0;
      while (!this.isOpaque(x, y) && tries++ < 30) {
        x = Math.floor(ax + this.rand() * aw);
        y = Math.floor(ay + this.rand() * ah);
      }
      if (!this.isOpaque(x, y)) continue;
      let dir = Math.floor(this.rand() * 4);
      for (let i = 0; i < len; i++) {
        this.px(x, y, i === 0 ? C.veinGlow : C.vein);
        if (this.rand() < 0.35) dir = (dir + (this.rand() < 0.5 ? 1 : 3)) % 4;
        const nx = x + [1, 0, -1, 0][dir]!;
        const ny = y + [0, 1, 0, -1][dir]!;
        if (!this.isOpaque(nx, ny)) break;
        x = nx;
        y = ny;
      }
    }
  }

  /** 발광 점 (눈, 핵 등) */
  glow(x: number, y: number, r: number, core: string, halo: string) {
    this.ellipse(x, y, r + 1, r + 1, halo, 0.45);
    this.ellipse(x, y, r, r, core);
  }

  /** 불투명 픽셀 둘레에 어두운 외곽선을 두른다. */
  outline(color = C.outline) {
    const img = this.ctx.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && d[(y * this.w + x) * 4 + 3]! > 40;
    const marks: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.px(x, y, color);
  }

  /** 좌우 반전 사본 */
  flipped(): Pix {
    const p = new Pix(this.w, this.h);
    p.ctx.translate(this.w, 0);
    p.ctx.scale(-1, 1);
    p.ctx.drawImage(this.canvas, 0, 0);
    return p;
  }
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
