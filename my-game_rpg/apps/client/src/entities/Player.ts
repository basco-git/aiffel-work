import Phaser from 'phaser';
import type { Faction } from '@tb/shared';
import { CFG } from '../core/data';
import { depthOf, toScreen } from '../core/iso';
import { shadowKey } from '../gfx/textures';

export class Player {
  readonly pos: { x: number; y: number };
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly radius = CFG.player.radius;
  /** 바라보는 방향 (타일 좌표, 정규화) */
  facing = { x: 1, y: 0 };
  attackCooldown = 0;
  invuln = 0;
  sinceHit = 99;
  dead = false;
  private animT = 0;
  private frame = 0;
  private flashT = 0;

  constructor(
    scene: Phaser.Scene,
    readonly faction: Faction,
    x: number,
    y: number,
  ) {
    this.pos = { x, y };
    this.shadow = scene.add.image(0, 0, shadowKey(scene, 9));
    this.sprite = scene.add.image(0, 0, `player_${faction}_0`).setOrigin(0.5, 0.97);
    this.sync();
  }

  get texBase() {
    return `player_${this.faction}`;
  }

  update(dt: number, moving: boolean) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHit += dt;
    if (moving) {
      this.animT += dt;
      if (this.animT > 0.16) {
        this.animT = 0;
        this.frame ^= 1;
        this.sprite.setTexture(`${this.texBase}_${this.frame}`);
      }
    }
    const s = toScreen(this.facing.x, this.facing.y);
    if (Math.abs(s.sx) > 0.01) this.sprite.setFlipX(s.sx < 0);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 20) % 2 ? 0.55 : 1);
    this.sync();
  }

  flash(color = 0xff4040) {
    this.sprite.setTintFill(color);
    this.flashT = 0.08;
  }

  sync() {
    const { sx, sy } = toScreen(this.pos.x, this.pos.y);
    this.sprite.setPosition(Math.round(sx), Math.round(sy));
    this.shadow.setPosition(Math.round(sx), Math.round(sy));
    const d = depthOf(this.pos.x, this.pos.y);
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 0.5);
  }

  setVisible(v: boolean) {
    this.sprite.setVisible(v);
    this.shadow.setVisible(v);
  }
}
