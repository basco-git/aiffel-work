import Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import type { Monster } from './Monster';

export class Projectile {
  readonly sprite: Phaser.GameObjects.Image;
  dead = false;

  constructor(
    scene: Phaser.Scene,
    texture: string,
    readonly pos: { x: number; y: number },
    readonly vel: { x: number; y: number },
    public life: number,
    readonly owner: 'player' | 'monster',
    readonly atk: number,
    readonly radius: number,
    readonly source?: Monster,
    readonly lift = 12,
  ) {
    this.sprite = scene.add.image(0, 0, texture);
    const s = toScreen(vel.x, vel.y);
    this.sprite.setRotation(Math.atan2(s.sy, s.sx));
    this.sync();
  }

  sync() {
    const { sx, sy } = toScreen(this.pos.x, this.pos.y);
    this.sprite.setPosition(Math.round(sx), Math.round(sy - this.lift));
    this.sprite.setDepth(depthOf(this.pos.x, this.pos.y) + 1);
  }

  destroy() {
    this.dead = true;
    this.sprite.destroy();
  }
}
