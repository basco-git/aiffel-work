import Phaser from 'phaser';
import { generateTextures } from '../gfx/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    generateTextures(this);
    this.game.events.emit('textures-ready');
  }
}
