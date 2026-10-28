import './ui/ui.css';
import Phaser from 'phaser';
import { render } from 'preact';
import { CFG, DATA } from './core/data';
import { input } from './core/input';
import { store } from './core/store';
import { BootScene } from './scenes/BootScene';
import { PlayScene } from './scenes/PlayScene';
import { App } from './ui/App';

/**
 * 내부 해상도: 세로 360 고정, 가로는 화면 비율에 맞춰 480~800.
 * 화면이 충분히 크면 정수 배율로 확대해 도트가 흐려지지 않게 한다.
 */
function computeSize() {
  const d = CFG.display;
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  let zoom = Math.min(wh / d.baseHeight, ww / d.minWidth);
  if (zoom >= 1) zoom = Math.floor(zoom);
  const w = Math.max(d.minWidth, Math.min(d.maxWidth, Math.floor(ww / zoom)));
  return { w, h: d.baseHeight, zoom };
}

const size = computeSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: size.w,
  height: size.h,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0b0810',
  disableContextMenu: true,
  scale: { mode: Phaser.Scale.NONE, zoom: size.zoom, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [BootScene, PlayScene],
});

window.addEventListener('resize', () => {
  const s = computeSize();
  game.scale.resize(s.w, s.h);
  game.scale.setZoom(s.zoom);
});

store.touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

game.events.once('textures-ready', () => void store.init());

// 화면 상태에 맞춰 플레이 씬을 켜고 끈다
let playing = false;
store.subscribe(() => {
  if (store.screen === 'play' && !playing) {
    playing = true;
    game.scene.start('play', { mode: 'world' });
  } else if (store.screen !== 'play' && playing) {
    playing = false;
    game.scene.stop('play');
  }
});

window.addEventListener('beforeunload', () => {
  void store.persistNow();
});

render(<App />, document.getElementById('ui')!);

// 자동 테스트와 디버그용 핸들
(window as unknown as { __tb: unknown }).__tb = { store, game, input, DATA };
