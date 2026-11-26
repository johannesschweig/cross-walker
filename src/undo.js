// Taking back a step (keyboard only, on purpose: there is no undo button).
import { game, player } from './state.js';
import { clearQueued } from './input.js';
import { sfx } from './audio.js';
import { updateHud } from './ui.js';

export function snapshot() {
  return {
    rows: game.grid.map((r) => r.join('')),
    crates: game.crates.map((c) => [c.gx, c.gy]),
    gx: player.gx, gy: player.gy,
    bucket: player.bucket,
    gold: game.gold,
    moves: game.moves,
  };
}

export function undo() {
  if (game.mode !== 'play' || !game.undo.length) return;
  const s = game.undo.pop();
  game.grid = s.rows.map((r) => r.split(''));
  game.crates = s.crates.map(([gx, gy]) => ({ gx, gy, toX: gx, toY: gy }));
  player.gx = player.fromX = s.gx;
  player.gy = player.fromY = s.gy;
  player.t = 1; player.moving = false; player.pushed = null;
  player.bucket = s.bucket;
  game.gold = s.gold;
  game.moves = s.moves;
  game.effects = [];
  clearQueued();
  sfx.undo();
  updateHud();
}
