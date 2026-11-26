// The rules of one step: what can be walked on, what a pushed crate does, what kills you.
// `tools/check-levels.js` mirrors these rules in a solver, so keep the two in sync.
import { DIRS, MOVE_TIME, BURN_TIME, CRUMBLE_TIME, SPLASH_TIME, STEAM_TIME, UNDO_LIMIT } from './config.js';
import { game, player, tileAt, crateAt } from './state.js';
import { sfx } from './audio.js';
import { clearInput } from './input.js';
import { updateHud } from './ui.js';
import { snapshot } from './undo.js';

const crateCanEnter = (gx, gy) => {
  const ch = tileAt(gx, gy);
  // floor, gold, open water or fire (the crate burns up): never bricks, the door, a bridge,
  // cracked floor ('x' / 'X') or a bucket ('b')
  return (ch === '.' || ch === 'g' || ch === '~' || ch === 'F') && !crateAt(gx, gy);
};

// Every step, walking or not, is one undo state and one count on the step counter.
function commitStep() {
  game.undo.push(snapshot());
  if (game.undo.length > UNDO_LIMIT) game.undo.shift();
  game.moves++;
  updateHud();
}

// Using the bucket: an empty one is filled at open water, a full one puts out fire. The player
// stays where they are, but it takes a step.
function useBucket(tx, ty) {
  if (player.bucket === 'empty') {
    player.bucket = 'full';
    game.effects.push({ type: 'splash', gx: tx, gy: ty, t: 0, dur: SPLASH_TIME });
    sfx.fill();
  } else {
    player.bucket = 'empty';
    game.grid[ty][tx] = '.';                // the fire is gone for good: plain floor
    game.effects.push({ type: 'steam', gx: tx, gy: ty, t: 0, dur: STEAM_TIME });
    sfx.douse();
  }
}

/** Starts a step in direction `name`. Returns true if the step started. */
export function startStep(name, carry) {
  const d = DIRS[name];
  const nx = player.gx + d.x, ny = player.gy + d.y;
  const ch = tileAt(nx, ny);
  if (ch === '#') return false;

  const bucketUse = (ch === '~' && player.bucket === 'empty') || (ch === 'F' && player.bucket === 'full');
  if (ch === '~' && !bucketUse) return false;

  const crate = bucketUse ? null : crateAt(nx, ny);
  if (crate) {
    const tx = nx + d.x, ty = ny + d.y;
    if (!crateCanEnter(tx, ty)) return false;
    crate.toX = tx; crate.toY = ty;
    sfx.push();
  }
  commitStep();
  if (bucketUse) {
    useBucket(nx, ny);
    player.fromX = player.gx; player.fromY = player.gy;    // no movement, but the step takes its time
    player.pushed = null;
    player.moving = true;
    player.t = carry / MOVE_TIME;
    return true;
  }
  if (tileAt(player.gx, player.gy) === 'x') {      // leaving cracked floor: it breaks further
    game.grid[player.gy][player.gx] = 'X';
    game.effects.push({ type: 'crumble', gx: player.gx, gy: player.gy, t: 0, dur: CRUMBLE_TIME });
    sfx.crack();
  }
  player.fromX = player.gx; player.fromY = player.gy;
  player.gx = nx; player.gy = ny;
  player.pushed = crate || null;
  player.moving = true;
  player.t = carry / MOVE_TIME;
  player.steps++;
  return true;
}

function die(cause) {
  game.mode = 'dying';
  game.modeTime = 0;
  game.deathCause = cause;
  clearInput();
  if (cause === 'collapse') sfx.collapse(); else sfx.fire();
  if (navigator.vibrate) navigator.vibrate(120);
}

/** The step has reached its tile: settle the crate, then deal with what the player stands on. */
export function finishStep() {
  player.moving = false;
  player.t = 1;
  const crate = player.pushed;
  player.pushed = null;
  if (crate) {
    crate.gx = crate.toX; crate.gy = crate.toY;
    if (tileAt(crate.gx, crate.gy) === '~') {   // the crate floats on the water: now a bridge
      game.grid[crate.gy][crate.gx] = 'w';
      game.crates.splice(game.crates.indexOf(crate), 1);
      sfx.splash();
    } else if (tileAt(crate.gx, crate.gy) === 'F') {   // the crate burns up; the fire stays
      game.crates.splice(game.crates.indexOf(crate), 1);
      game.effects.push({ type: 'burn', gx: crate.gx, gy: crate.gy, t: 0, dur: BURN_TIME });
      sfx.burn();
    }
  }

  const ch = tileAt(player.gx, player.gy);
  if (ch === 'F') { die('fire'); return; }
  if (ch === 'X') { die('collapse'); return; }     // broken floor gives way under you
  if (ch === 'g') {
    game.grid[player.gy][player.gx] = '.';
    game.gold++;
    sfx.gold();
    updateHud();
  } else if (ch === 'b' && !player.bucket) {      // pick up a bucket (one at a time; a second is left)
    game.grid[player.gy][player.gx] = '.';
    player.bucket = 'empty';
    sfx.pickup();
  } else if (ch === 'D') {
    game.mode = 'exiting';                 // walk into the door, then show the result
    game.modeTime = 0;
    clearInput();
    sfx.win();
  }
}
