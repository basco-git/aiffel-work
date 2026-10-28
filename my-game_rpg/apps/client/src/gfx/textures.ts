import Phaser from 'phaser';
import { DATA } from '../core/data';
import type { Pix } from './pix';
import { MONSTER_PAINTERS, manager, npcGenetic, npcMechanic, playerGenetic, playerMechanic, type Painter } from './sprites';
import { TILE_TYPES, TILE_VARIANTS, paintBlock, paintFx, paintShadow, paintTile, paintTower, paintTree } from './tiles';

function add(scene: Phaser.Scene, key: string, pix: Pix) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, pix.canvas);
}

function addFrames(scene: Phaser.Scene, key: string, painter: Painter) {
  add(scene, `${key}_0`, painter(0));
  add(scene, `${key}_1`, painter(1));
}

/** 모든 임시 그래픽을 코드로 그려 텍스처로 등록한다. */
export function generateTextures(scene: Phaser.Scene) {
  addFrames(scene, 'player_mechanic', playerMechanic);
  addFrames(scene, 'player_genetic', playerGenetic);
  addFrames(scene, 'npc_mechanic', npcMechanic);
  addFrames(scene, 'npc_genetic', npcGenetic);
  for (const [id, painter] of Object.entries(MONSTER_PAINTERS)) addFrames(scene, `mon_${id}`, painter);
  for (const fl of DATA.tower.floors)
    addFrames(scene, `mgr_${fl.floor}`, manager(fl.manager.sizePx, fl.manager.color, fl.manager.pattern === 'boss'));

  for (const t of TILE_TYPES)
    for (let v = 0; v < TILE_VARIANTS; v++) {
      const pix = paintTile(t, v);
      if (pix) add(scene, `tile_${t}_${v}`, pix);
    }
  add(scene, 'wall_metal', paintBlock('#5a6272', '#3a404c', '#2a2f38', 14, '#4ff0ff'));
  add(scene, 'wall_flesh', paintBlock('#6a3040', '#4a1e2a', '#34141e', 14, '#c23cf0'));
  add(scene, 'wall_tower', paintBlock('#3a3050', '#241e34', '#18141f', 18, '#8a54d0'));
  for (let v = 0; v < 3; v++) add(scene, `tree_${v}`, paintTree(v));
  add(scene, 'tower', paintTower());

  const fx = paintFx();
  for (const [k, pix] of Object.entries(fx)) add(scene, `fx_${k}`, pix);
  add(scene, 'obj_pylon_0', fx.pylon);
  add(scene, 'obj_pylon_1', fx.pylon);
}

/** 반지름(px)별 그림자 텍스처를 필요할 때 만든다. */
export function shadowKey(scene: Phaser.Scene, rx: number): string {
  const r = Math.max(4, Math.round(rx));
  const key = `shadow_${r}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, paintShadow(r).canvas);
  return key;
}
