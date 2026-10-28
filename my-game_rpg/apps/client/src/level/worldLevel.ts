import type { Faction } from '@tb/shared';
import { DATA } from '../core/data';
import { hash2, valueNoise } from '../core/rng';
import type { TileType } from '../gfx/tiles';
import { BLOCK_ALL, BLOCK_MON, BLOCK_WALK, Level } from './level';

export const TREE_ORIGIN_Y = 0.94;

function inRects(x: number, y: number, rects: [number, number, number, number][] | undefined) {
  return !!rects?.some(([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh);
}

/** world.json으로 오픈필드 맵을 만든다. 상대 세력 거점 입구는 막힌다. */
export function buildWorld(faction: Faction): Level {
  const W = DATA.world;
  const lv = new Level('world', W.width, W.height);

  W.regions.forEach((r, ri) => {
    lv.regions.push({ id: r.id, name: r.name, kind: r.kind, contamination: r.contamination, faction: r.faction });
    const [rx, ry, rw, rh] = r.rect;
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        let tile = r.tile as TileType;
        let flags = r.kind === 'base' ? BLOCK_MON : 0;
        const clear = inRects(x, y, r.clear);
        if (r.obstacle && !clear) {
          if (r.obstacle.kind === 'tree' && hash2(x, y, r.obstacle.seed) < r.obstacle.density) {
            flags = BLOCK_ALL;
            lv.props.push({ key: `tree_${Math.floor(hash2(x, y, 99) * 3)}`, x: x + 0.5, y: y + 0.5, originY: TREE_ORIGIN_Y });
          } else if (r.obstacle.kind === 'deepwater') {
            const n = valueNoise(x, y, 5, r.obstacle.seed);
            if (n < r.obstacle.density) {
              tile = 'deepwater';
              // 떠다니는 몬스터는 깊은 물 위로 지나갈 수 있다
              flags = BLOCK_WALK;
            } else if (n < r.obstacle.density + 0.1) tile = 'shallow';
          }
        }
        lv.setTile(x, y, tile, flags, ri);
      }
    }

    // 거점 외벽과 입구
    if (r.kind === 'base') {
      const wallKey = r.tile === 'metal' ? 'wall_metal' : 'wall_flesh';
      const enemyBase = r.faction !== faction;
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
          if (!edge) continue;
          const g = r.gate;
          const gateAt =
            g &&
            ((g.side === 'east' && x === rx + rw - 1) ||
              (g.side === 'west' && x === rx) ||
              (g.side === 'north' && y === ry) ||
              (g.side === 'south' && y === ry + rh - 1));
          const along = g && (g.side === 'east' || g.side === 'west' ? y - ry : x - rx);
          const isGate = gateAt && along! >= g!.from && along! <= g!.to;
          if (isGate) {
            if (enemyBase) {
              lv.addFlag(x, y, BLOCK_ALL);
              lv.props.push({ key: 'fx_barrier', x: x + 1, y: y + 1, originY: 1, depthBias: -4 });
            }
            continue;
          }
          lv.addFlag(x, y, BLOCK_ALL);
          lv.props.push({ key: wallKey, x: x + 1, y: y + 1, originY: 1, depthBias: -4 });
        }
      }
    }
  });

  // 탑 본체
  const [bx, by, bw, bh] = W.tower.blocked;
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) lv.addFlag(x, y, BLOCK_ALL);
  lv.props.push({ key: 'tower', x: bx + bw / 2 + 0.5, y: by + bh / 2 + 0.5, originY: 0.93, depthBias: 40 });

  lv.spawn = { ...W.respawn[faction] };
  return lv;
}
