import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // GitHub Pages 하위 경로(/aiffel-work/my-game_rpg/)에서도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [preact()],
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
