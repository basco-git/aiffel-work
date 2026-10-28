import { C, Pix, shade } from './pix';

/**
 * 코드로 그리는 임시 픽셀 그래픽.
 * 몬스터는 PRD 8장 "오염 변이" 규칙을 따른다: 실루엣 비틀기, 보라 혈관·검은 결정, 특징 부위 강조.
 * 모든 그림은 오른쪽을 바라보며, 게임에서 좌우 반전해 쓴다. f는 걷기 프레임(0/1).
 */
export type Painter = (f: number) => Pix;

// ---------------- 플레이어 (키 32px, 프레임 32×40) ----------------

function mechanicBody(f: number, palette: { metal: string; dark: string; light: string; glow: string }): Pix {
  const p = new Pix(32, 40, 3);
  const { metal, dark, light, glow } = palette;
  const step = f ? 1 : -1;
  // 다리 (기계 관절)
  p.rect(12 + step, 28, 3, 9, dark);
  p.rect(18 - step, 28, 3, 9, dark);
  p.rect(12 + step, 31, 3, 2, light);
  p.rect(18 - step, 31, 3, 2, light);
  p.rect(11 + step, 37, 5, 2, dark);
  p.rect(17 - step, 37, 5, 2, dark);
  // 몸통 장갑
  p.rect(10, 15, 12, 14, metal);
  p.rect(10, 15, 3, 14, dark);
  p.rect(13, 17, 6, 3, light);
  p.rect(14, 22, 4, 4, glow);
  p.px(15, 23, C.white);
  // 왼팔
  p.rect(7, 16, 3, 10, dark);
  p.rect(7, 25, 3, 2, metal);
  // 오른팔 = 팔 캐논
  p.rect(20, 16, 5, 4, metal);
  p.rect(22, 18, 7, 4, dark);
  p.rect(28, 19, 2, 2, glow);
  // 머리 = 헬멧 + 바이저
  p.blob(16, 9, 5.5, 5.5, metal, dark, light);
  p.rect(14, 8, 7, 2, glow);
  p.px(20, 8, C.white);
  p.rect(12, 3, 1, 3, dark);
  p.outline();
  return p;
}

export const playerMechanic: Painter = (f) =>
  mechanicBody(f, { metal: '#7c8aa0', dark: '#3c4658', light: '#b8c6dc', glow: '#4ff0ff' });

export const playerGenetic: Painter = (f) => {
  const p = new Pix(32, 40, 4);
  const skin = '#c69078';
  const skinDark = '#8a5848';
  const carapace = '#4e6a3a';
  const step = f ? 1 : -1;
  // 각반·발: 갑각으로 덮인 다리
  p.rect(12 + step, 27, 3, 10, carapace);
  p.rect(18 - step, 27, 3, 10, carapace);
  p.rect(12 + step, 29, 3, 1, '#7a9a5a');
  p.rect(18 - step, 29, 3, 1, '#7a9a5a');
  p.rect(11 + step, 37, 5, 2, '#2e4020');
  p.rect(17 - step, 37, 5, 2, '#2e4020');
  // 몸통
  p.rect(11, 15, 10, 13, skin);
  p.rect(11, 15, 2, 13, skinDark);
  p.rect(12, 24, 9, 3, '#3a2a30');
  // 왼팔
  p.rect(8, 16, 3, 10, skin);
  // 오른손 = 무기화된 손 (비대한 갈고리)
  p.rect(20, 16, 4, 6, skin);
  p.blob(25, 23, 4.5, 4, '#8a3a5a', '#5a1e3a', '#c06080');
  p.line(27, 21, 31, 18, C.bone);
  p.line(28, 23, 31, 23, C.bone);
  p.line(27, 25, 30, 28, C.bone);
  // 머리
  p.blob(16, 9, 4.5, 5.5, skin, skinDark, '#e8b8a0');
  p.rect(17, 8, 3, 2, '#7dff6a');
  p.px(19, 8, C.white);
  p.rect(12, 4, 8, 2, '#3a2a30');
  p.veins(4, 6, [8, 4, 20, 26]);
  p.outline();
  return p;
};

// ---------------- NPC ----------------

export const npcMechanic: Painter = (f) => {
  const p = mechanicBody(0, { metal: '#c87a30', dark: '#6a3c18', light: '#f0b060', glow: '#ffe066' });
  if (f) p.rect(4, 15, 3, 3, '#ffe066');
  return p;
};

export const npcGenetic: Painter = (f) => {
  const p = new Pix(32, 40, 6);
  p.rect(10, 15, 12, 22, '#d8e0d0');
  p.rect(10, 15, 3, 22, '#9aa894');
  p.rect(15, 18, 2, 14, '#5fd36a');
  p.rect(9, 36, 14, 2, '#9aa894');
  p.rect(7, 17, 3, 9, '#d8e0d0');
  p.rect(22, 17, 3, 9, '#d8e0d0');
  p.rect(22, 25, 3, 4, f ? '#7dff6a' : '#4aa040');
  p.blob(16, 9, 4.5, 5, '#e0b8a0', '#a07868', '#f8d8c0');
  p.rect(12, 3, 9, 4, '#4a6a3a');
  p.rect(17, 8, 3, 1, '#2a2a2a');
  p.outline();
  return p;
};

// ---------------- 정글 몬스터 ----------------

const JG = { skin: '#5a7a34', dark: '#34481e', light: '#8aac4a' };
const SEA = { skin: '#9aacb4', dark: '#5c6e78', light: '#d0dce0' };

/** 변이 독개미 (소형 20px): 반투명 독주머니로 부푼 배, 머리 한쪽 결정, 비대칭 7다리 */
export const poisonAnt: Painter = (f) => {
  const p = new Pix(24, 18, 11);
  const legY = f ? 1 : 0;
  const legs: [number, number, number, number][] = [
    [9, 10, 6, 15 + legY], [11, 10, 10, 16 - legY], [13, 10, 15, 15 + legY],
    [10, 11, 7, 16 - legY], [12, 11, 12, 17 + legY], [14, 11, 17, 16 - legY], [15, 10, 19, 14],
  ];
  for (const [a, b, c, d] of legs) p.line(a, b, c, d, '#2a1a12');
  // 독주머니 배 (특징 부위)
  p.ellipse(6, 9, 5.5, 4.5, '#5a2a6a');
  p.ellipse(6, 9, 4.5, 3.5, '#a050d0', 0.85);
  p.ellipse(5, 8, 2, 1.5, '#ff9cff', 0.8);
  p.px(7, 10, C.veinGlow);
  p.ellipse(12, 9, 2.5, 2, '#3a2418');
  p.blob(17, 8, 3, 2.5, '#4a3020', '#2a1a12', '#7a5030');
  p.px(18, 7, '#ff3040');
  p.line(19, 6, 22, 3, '#2a1a12');
  p.crystal(16, 6, 4, -0.4);
  p.outline();
  return p;
};

/** 가시덩굴 새싹 (소형 18px): 눈알 구근, 뿌리 다리, 보라 진액 가시 */
export const thornSprout: Painter = (f) => {
  const p = new Pix(18, 22, 12);
  const s = f ? 1 : 0;
  // 뿌리 다리
  p.path([[8, 15], [5, 18], [3 + s, 21]], '#4a3420');
  p.path([[9, 15], [9, 19], [10 - s, 21]], '#4a3420');
  p.path([[10, 15], [13, 18], [15 + s, 21]], '#4a3420');
  // 줄기와 가시
  p.rect(8, 9, 3, 7, JG.skin);
  p.px(7, 11, '#c060ff');
  p.px(11, 13, '#c060ff');
  p.px(6, 11, C.veinGlow);
  p.px(12, 13, C.veinGlow);
  // 잎
  p.ellipse(5, 12, 2.5, 1.2, JG.light);
  p.ellipse(13, 10, 2.5, 1.2, JG.light);
  // 눈알 구근 (특징 부위)
  p.blob(9, 5, 4.5, 4.5, '#7a8a3a', '#4a5a20', '#a8b860');
  p.ellipse(10, 5, 2.6, 2.6, C.white);
  p.ellipse(10.5, 5, 1.4, 1.6, '#b030e0');
  p.px(10, 5, '#200830');
  p.px(9, 4, C.white);
  p.outline();
  return p;
};

/** 변이 원숭이 (중형 44px): 털 빠진 피부의 보라 혈관, 한쪽만 비대한 팔, 세로로 갈라진 턱 */
export const mutantMonkey: Painter = (f) => {
  const p = new Pix(40, 46, 13);
  const s = f ? 1 : 0;
  const skin = '#b08a7a';
  const dark = '#6a4a40';
  // 다리 (짧고 굽음)
  p.rect(12, 34, 4, 8 + s, dark);
  p.rect(19, 35, 4, 7 - s, dark);
  p.rect(11, 41 + s, 6, 2, '#3a2420');
  p.rect(18, 41 - s, 6, 2, '#3a2420');
  // 굽은 몸통
  p.blob(17, 27, 9, 10, skin, dark, '#d0aa98');
  // 남은 털
  p.rect(9, 20, 4, 6, '#4a3a28');
  p.rect(14, 33, 5, 3, '#4a3a28');
  // 작은 왼팔
  p.rect(9, 26, 3, 9, dark);
  // 비대한 오른팔 (특징 부위): 땅을 짚는다
  p.blob(28, 24, 6, 6, skin, dark, '#d0aa98');
  p.rect(28, 28, 8, 12, skin);
  p.rect(33, 28, 3, 12, dark);
  p.blob(32, 41, 6, 3.5, skin, dark, '#d0aa98');
  p.line(28, 43, 26, 45, C.bone);
  p.line(32, 44, 32, 45, C.bone);
  p.line(36, 43, 38, 45, C.bone);
  p.crystal(27, 20, 6, 0.4);
  // 머리: 세로로 갈라진 턱
  p.blob(19, 12, 7, 7, skin, dark, '#d0aa98');
  p.rect(23, 10, 2, 9, '#400818');
  p.px(24, 12, C.bone);
  p.px(24, 15, C.bone);
  p.px(23, 17, C.bone);
  p.px(16, 10, '#ffde40');
  p.px(20, 9, '#ffde40');
  p.veins(9, 9, [8, 6, 30, 36]);
  p.outline();
  return p;
};

/** 독거미 (중형 36px): 몸통 전체에 흩어진 눈, 등에서 빛나는 결정 군락, 마디마다 고름 주머니 */
export const poisonSpider: Painter = (f) => {
  const p = new Pix(40, 30, 14);
  const s = f ? 1 : -1;
  const legColor = '#2a1e2a';
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 5;
    const lift = (i % 2 ? s : -s) * 1;
    p.path([[x, 17], [x - 6, 12 + lift], [x - 9, 26 + lift]], legColor, 1);
    p.path([[x + 2, 17], [x + 8, 12 - lift], [x + 11, 26 - lift]], legColor, 1);
    p.px(x - 6, 12 + lift, '#d0c040');
    p.px(x + 8, 12 - lift, '#d0c040');
  }
  p.blob(19, 18, 10, 6, '#3a2a40', '#1e1424', '#5a4460');
  p.blob(31, 19, 4.5, 4, '#3a2a40', '#1e1424', '#5a4460');
  // 흩어진 눈
  for (const [x, y] of [[30, 18], [33, 18], [31, 20], [22, 16], [15, 19], [25, 21], [12, 17]]) p.px(x!, y!, '#ff2840');
  // 결정 등딱지 (특징 부위)
  p.crystal(14, 14, 7, -0.3);
  p.crystal(18, 13, 9, 0);
  p.crystal(22, 14, 6, 0.4);
  p.ellipse(18, 12, 4, 3, C.veinGlow, 0.35);
  p.line(33, 22, 35, 25, C.bone);
  p.outline();
  return p;
};

/** 식인 거대꽃 (대형 90px): 이빨 달린 턱 꽃잎, 촉수처럼 움직이는 덩굴 다발, 맥동하는 오염 핵 */
export const maneaterFlower: Painter = (f) => {
  const p = new Pix(84, 92, 15);
  const sway = f ? 2 : -2;
  // 덩굴 다발 (줄기 대신)
  for (let i = 0; i < 7; i++) {
    const bx = 22 + i * 7;
    p.path([[bx, 90], [bx + sway * (i % 2 ? 1 : -1), 74], [40 + (i - 3) * 3, 56]], i % 2 ? '#3a5a24' : '#2a4018', 3);
  }
  // 바닥으로 뻗은 촉수
  p.path([[30, 80], [16, 74 + sway], [6, 82], [3, 88]], '#2a4018', 3);
  p.path([[56, 80], [70, 72 - sway], [79, 80], [81, 86]], '#2a4018', 3);
  p.px(3, 88, C.veinGlow);
  p.px(81, 86, C.veinGlow);
  // 턱 꽃잎 6장
  const cx = 42;
  const cy = 34;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (f ? 0.08 : 0);
    const px = cx + Math.cos(a) * 20;
    const py = cy + Math.sin(a) * 15;
    p.blob(px, py, 12, 9, '#a03050', '#5a1028', '#e06080');
    for (let t = 0; t < 4; t++) {
      const ta = a + (t - 1.5) * 0.25;
      const tx = cx + Math.cos(ta) * 12;
      const ty = cy + Math.sin(ta) * 9;
      p.line(tx, ty, tx + Math.cos(a) * 3, ty + Math.sin(a) * 3, C.bone);
    }
  }
  // 목구멍과 오염 핵 (특징 부위)
  p.ellipse(cx, cy, 12, 9, '#2a0818');
  p.glow(cx, cy, f ? 6 : 5, '#ff6cff', '#c23cf0');
  p.ellipse(cx - 1, cy - 1, 2, 2, C.white);
  p.crystal(24, 20, 10, -0.5);
  p.crystal(62, 22, 12, 0.5);
  p.crystal(42, 12, 9, 0);
  p.veins(14, 12, [10, 10, 64, 40]);
  p.outline();
  return p;
};

// ---------------- 해협 몬스터 ----------------

/** 변이 게 (소형 26px): 몸통만큼 비대한 한쪽 집게, 갈라진 등껍질 사이 결정, 여러 개의 눈자루 */
export const mutantCrab: Painter = (f) => {
  const p = new Pix(30, 22, 21);
  const s = f ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    p.path([[7 + i * 3, 14], [3 + i * 3, 17 + s], [2 + i * 3, 20]], SEA.dark);
    p.path([[11 + i * 2, 15], [14 + i * 2, 18 - s], [15 + i * 2, 20]], SEA.dark);
  }
  p.blob(10, 12, 8, 5, SEA.skin, SEA.dark, SEA.light);
  // 갈라진 등껍질
  p.line(6, 9, 12, 13, '#7a2a3a');
  p.line(12, 13, 15, 10, '#7a2a3a');
  p.crystal(10, 11, 4, 0);
  // 눈자루
  for (const x of [6, 8, 11, 13]) {
    p.line(x, 8, x + (x % 3) - 1, 4, SEA.dark);
    p.px(x + (x % 3) - 1, 3, '#ffcc30');
  }
  // 비대한 집게 (특징 부위)
  p.blob(22, 12 - s, 7, 6, '#c0b0b8', '#7a6a72', '#f0e8ec');
  p.rect(23, 4 - s, 6, 4, '#c0b0b8');
  p.rect(23, 12 - s, 6, 3, '#7a6a72');
  p.line(25, 8 - s, 29, 8 - s, '#3a1a20');
  p.veins(3, 5, [16, 6, 14, 12]);
  p.outline();
  return p;
};

/** 독해파리 (소형 24px): 공중을 떠다님, 투명한 갓 안의 검은 결정 핵, 갈고리 촉수 */
export const toxicJelly: Painter = (f) => {
  const p = new Pix(20, 26, 22);
  const s = f ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const x = 5 + i * 3.3;
    p.path([[x, 10], [x + s, 15], [x - s, 20], [x + 1, 23]], '#a090c8');
    p.line(x + 1, 23, x + 2, 22, C.bone);
  }
  p.ellipse(10, 7, 8, 6.5, '#b0d8f0', 0.55);
  p.ellipse(10, 6, 6.5, 5, '#d8f0ff', 0.4);
  p.rect(3, 10, 14, 2, '#80a8d0', 0.7);
  // 결정 핵 (특징 부위는 촉수, 핵은 오염 표식)
  p.crystal(10, 10, 6, 0);
  p.glow(10, 7, 1, C.veinGlow, C.vein);
  p.px(6, 4, C.white);
  p.outline('#1a2030');
  return p;
};

/** 가시 장어 (중형 48px 길이): 드러난 등뼈 가시, 네 갈래 턱, 몸통 옆 발광 반점 */
export const spikeEel: Painter = (f) => {
  const p = new Pix(50, 22, 23);
  const wave = f ? 1 : -1;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) pts.push([3 + i, 13 + Math.sin(i / 5 + (f ? 1 : 0)) * 2.5 * wave]);
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    const r = 2 + Math.sin((i / pts.length) * Math.PI) * 2.5;
    p.ellipse(x, y, 1.2, r, i % 2 ? '#4a5a6a' : '#566878');
  }
  // 등뼈 가시 (특징 부위)
  for (let i = 4; i < 38; i += 4) {
    const [x, y] = pts[i]!;
    const r = 2 + Math.sin((i / pts.length) * Math.PI) * 2.5;
    p.line(x, y - r, x - 1, y - r - 4, C.bone);
    p.px(x - 1, y - r - 4, C.white);
  }
  // 발광 반점
  for (let i = 6; i < 36; i += 6) p.px(pts[i]![0], pts[i]![1] + 1, C.veinGlow);
  // 네 갈래 턱
  const [hx, hy] = pts[40]!;
  p.blob(hx + 2, hy, 4, 4, '#566878', '#344250', '#8a9cac');
  p.line(hx + 4, hy - 1, hx + 8, hy - 5, '#344250', 2);
  p.line(hx + 4, hy + 1, hx + 8, hy + 5, '#344250', 2);
  p.line(hx + 5, hy - 1, hx + 8, hy - 1, '#344250');
  p.line(hx + 5, hy + 1, hx + 8, hy + 1, '#344250');
  p.px(hx + 7, hy - 4, C.bone);
  p.px(hx + 7, hy + 4, C.bone);
  p.px(hx + 2, hy - 2, '#ffcc30');
  p.outline();
  return p;
};

/** 갑옷 거북 (중형 40px): 결정과 종양으로 뒤덮인 산호초 같은 등껍질, 뼈가 드러난 긴 목 */
export const armoredTurtle: Painter = (f) => {
  const p = new Pix(42, 32, 24);
  const s = f ? 1 : 0;
  p.rect(9, 23, 5, 6 + s, SEA.dark);
  p.rect(24, 23, 5, 6 - s, SEA.dark);
  p.blob(19, 19, 14, 9, '#5a6a5a', '#343e34', '#8a9a80');
  // 종양과 결정 (특징 부위: 결정 등껍질)
  p.blob(12, 13, 3, 2.5, '#9a6a7a', '#6a3a4a', '#c08a9a');
  p.blob(25, 12, 2.5, 2, '#9a6a7a', '#6a3a4a', '#c08a9a');
  p.crystal(16, 13, 8, -0.3);
  p.crystal(20, 12, 10, 0.1);
  p.crystal(29, 15, 6, 0.5);
  p.crystal(9, 16, 5, -0.6);
  // 뼈가 드러난 긴 목
  p.path([[31, 18], [35, 14], [37, 9]], SEA.skin, 3);
  for (const [x, y] of [[33, 16], [35, 12]]) p.px(x!, y!, C.bone);
  p.blob(38, 7, 3.5, 3, SEA.skin, SEA.dark, SEA.light);
  p.px(39, 6, '#ffcc30');
  p.veins(5, 7, [6, 14, 28, 12]);
  p.outline();
  return p;
};

/** 변이 상어 (대형 112px 길이): 몸통을 따라 갈라진 겹아가미, 다리가 된 가슴지느러미, 빛나는 목구멍 */
export const mutantShark: Painter = (f) => {
  const p = new Pix(114, 50, 25);
  const s = f ? 2 : 0;
  // 다리가 된 지느러미
  p.path([[44, 32], [40, 40 + s], [36, 46]], '#4a5a66', 4);
  p.path([[62, 33], [66, 41 - s], [70, 46]], '#4a5a66', 4);
  p.rect(33, 45, 6, 2, '#2a343c');
  p.rect(68, 45, 6, 2, '#2a343c');
  // 몸통
  p.blob(56, 26, 44, 12, '#8a9aa6', '#4a5a66', '#c0ccd4');
  p.ellipse(62, 31, 30, 5, '#d8dcd8');
  // 꼬리
  p.path([[12, 26], [4, 14], [2, 10]], '#4a5a66', 4);
  p.path([[12, 26], [4, 36], [3, 40]], '#4a5a66', 4);
  // 등지느러미 + 결정
  p.path([[52, 15], [58, 3], [64, 15]], '#4a5a66', 3);
  p.crystal(40, 16, 9, -0.4);
  p.crystal(72, 16, 7, 0.3);
  // 겹아가미 (특징 부위)
  for (let i = 0; i < 6; i++) {
    const x = 70 - i * 6;
    p.line(x, 20, x - 2, 32, '#40081c', 2);
    p.line(x + 1, 21, x - 1, 31, C.veinGlow);
  }
  // 입과 빛나는 목구멍
  p.ellipse(100, 30, 10, 5, '#30060e');
  p.glow(97, 30, 2, '#ff7cff', '#c23cf0');
  for (let i = 0; i < 6; i++) {
    p.line(92 + i * 3, 26, 93 + i * 3, 28, C.bone);
    p.line(92 + i * 3, 34, 93 + i * 3, 32, C.bone);
  }
  p.px(96, 22, '#ffcc30');
  p.px(97, 22, '#ffcc30');
  p.veins(10, 12, [20, 16, 70, 18]);
  p.outline();
  return p;
};

// ---------------- 탑 관리자 (외계 지능체) ----------------

/** 길쭉한 머리, 여러 개의 눈, 떠다니는 결정을 두른 외계 관리자. 층마다 색이 다르다. */
export function manager(sizePx: number, color: string, boss: boolean): Painter {
  return (f) => {
    const h = Math.round(sizePx);
    const w = Math.round(sizePx * (boss ? 0.95 : 0.7));
    const p = new Pix(w, h + 2, Math.round(sizePx * 7));
    const cx = w / 2;
    const dark = shade(color, -0.35);
    const light = shade(color, 0.25);
    const bob = f ? 1 : 0;
    // 로브
    for (let y = Math.round(h * 0.42); y < h - 1; y++) {
      const t = (y - h * 0.42) / (h * 0.58);
      const rw = w * (0.16 + t * 0.2);
      p.rect(cx - rw, y + bob, rw * 2, 1, y % 5 === 0 ? dark : '#2a2438');
    }
    p.rect(cx - w * 0.04, h * 0.45 + bob, w * 0.08, h * 0.5, color);
    // 가는 팔
    p.path([[cx - w * 0.16, h * 0.46 + bob], [cx - w * 0.36, h * 0.62], [cx - w * 0.4, h * 0.72]], '#d8d0e8', 2);
    p.path([[cx + w * 0.16, h * 0.46 + bob], [cx + w * 0.36, h * 0.56], [cx + w * 0.42, h * 0.5]], '#d8d0e8', 2);
    p.glow(cx + w * 0.42, h * 0.48, Math.max(1.5, sizePx / 30), light, color);
    // 길쭉한 머리
    p.blob(cx, h * 0.24 + bob, w * 0.2, h * 0.2, '#d8d0e8', '#8a80a0', C.white);
    p.ellipse(cx, h * 0.12 + bob, w * 0.14, h * 0.07, color);
    // 여러 개의 눈
    const er = Math.max(1, sizePx / 40);
    for (const [ex, ey] of [[0.05, 0.22], [0.12, 0.26], [-0.04, 0.27], [0.08, 0.31]]) p.glow(cx + w * ex!, h * ey! + bob, er, '#101010', color);
    // 떠다니는 결정
    p.crystal(cx - w * 0.38, h * 0.36 - bob, Math.round(sizePx / 9), -0.3);
    p.crystal(cx + w * 0.4, h * 0.3 + bob, Math.round(sizePx / 10), 0.3);
    if (boss) {
      // 감독관: 머리 위 결정 왕관과 등 뒤의 광륜
      for (let i = -2; i <= 2; i++) p.crystal(cx + i * w * 0.07, h * 0.06 + bob, Math.round(sizePx / 7) - Math.abs(i) * 2, i * 0.2);
      p.ellipse(cx, h * 0.28, w * 0.46, h * 0.05, color, 0.35);
    }
    p.veins(boss ? 10 : 5, 8, [0, Math.round(h * 0.4), w, Math.round(h * 0.5)]);
    p.outline();
    return p;
  };
}

export const MONSTER_PAINTERS: Record<string, Painter> = {
  poison_ant: poisonAnt,
  thorn_sprout: thornSprout,
  mutant_monkey: mutantMonkey,
  poison_spider: poisonSpider,
  maneater_flower: maneaterFlower,
  mutant_crab: mutantCrab,
  toxic_jelly: toxicJelly,
  spike_eel: spikeEel,
  armored_turtle: armoredTurtle,
  mutant_shark: mutantShark,
};
