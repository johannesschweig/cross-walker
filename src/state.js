// The one mutable game state. Other modules import these objects and change their fields.

export const player = {
  gx: 0, gy: 0,                 // tile we are on (or moving to)
  fromX: 0, fromY: 0,           // tile we started the current step on
  t: 1, moving: false,          // progress of the current step, 0..1
  pushed: null,                 // crate being pushed during this step
  steps: 0,
};

export const game = {
  level: 0,
  gold: 0,
  goldAtLevelStart: 0,
  levelGoldTotal: 0,
  mode: 'play',      // 'play' | 'dying' | 'exiting' | 'result' | 'end'
  modeTime: 0,
  fade: 0,
  time: 0,           // seconds since start, drives idle animations
  moves: 0,
  effects: [],       // short-lived visual effects, e.g. { type: 'burn', gx, gy, t, dur }
  grid: [],          // array of arrays of tile characters
  w: 1, h: 1,
  crates: [],        // { gx, gy, toX, toY }
  undo: [],
};

export const tileAt = (tx, ty) => (game.grid[ty] && game.grid[ty][tx]) || '#';
export const crateAt = (gx, gy) => game.crates.find((c) => c.gx === gx && c.gy === gy);
export const goldLeft = () => game.grid.reduce((n, row) => n + row.filter((c) => c === 'g').length, 0);
