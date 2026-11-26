// Game flow: loading levels, the fixed-step update, finishing a level, moving on.
import { LEVELS } from './levels.js';
import { MOVE_TIME, DEATH_TIME, FADE_TIME, EXIT_TIME, THREE_STAR_SLACK } from './config.js';
import { game, player, goldLeft } from './state.js';
import { best, saveBest, writeProgress, loadProgress, clearProgress } from './storage.js';
import { clearInput, nextDirection } from './input.js';
import { updateHud, renderLevelGrid, showResult, hideResult, showEnd, hideEnd } from './ui.js';
import { startStep, finishStep } from './rules.js';

export function loadLevel(index, { fresh = true } = {}) {
  const def = LEVELS[index];
  game.level = index;
  game.grid = def.rows.map((r) => r.split(''));
  game.h = game.grid.length;
  game.w = game.grid[0].length;
  game.crates = [];
  for (let y = 0; y < game.h; y++) {
    for (let x = 0; x < game.w; x++) {
      const ch = game.grid[y][x];
      if (ch === 'S') {
        player.gx = player.fromX = x;
        player.gy = player.fromY = y;
        game.grid[y][x] = '.';
      } else if (ch === 'c') {
        game.crates.push({ gx: x, gy: y, toX: x, toY: y });
        game.grid[y][x] = '.';
      }
    }
  }
  player.t = 1; player.moving = false; player.pushed = null; player.steps = 0;
  player.bucket = null;               // tools are only carried within one level
  player.pickaxe = false;
  clearInput();                       // make the player press a key again after (re)starting
  game.undo = [];
  game.moves = 0;
  game.effects = [];
  hideResult();
  game.goldAtLevelStart = game.gold;
  game.levelGoldTotal = goldLeft();
  game.mode = 'play';
  game.modeTime = 0;
  if (fresh) game.fade = FADE_TIME;
  hideEnd();
  writeProgress(game.level, game.goldAtLevelStart);
  updateHud();
  renderLevelGrid();
}

/** Continue where the player left off last time, or start from level 1. */
export function startGame() {
  const saved = loadProgress();
  game.gold = saved ? saved.gold : 0;
  loadLevel(saved ? saved.level : 0);
}

function newGame() {
  game.gold = 0;
  loadLevel(0);
}

export function playAgain() {
  clearProgress();
  newGame();
}

export function restartLevel() {
  if (game.mode !== 'play') return;
  game.gold = game.goldAtLevelStart;
  loadLevel(game.level, { fresh: false });
}

/** "Retry" on the result panel. */
export function retryLevel() {
  hideResult();
  game.gold = game.goldAtLevelStart;       // replaying a level doesn't count its gold twice
  loadLevel(game.level);
}

function completeLevel() {
  const def = LEVELS[game.level];
  const got = game.levelGoldTotal - goldLeft();
  const allGold = got === game.levelGoldTotal;
  const limit = Math.ceil(def.par * THREE_STAR_SLACK);
  const stars = allGold ? (game.moves <= limit ? 3 : 2) : 1;
  const prev = best[game.level];
  if (!prev || stars > prev.stars || (stars === prev.stars && game.moves < prev.moves)) {
    best[game.level] = { stars, moves: game.moves };
    saveBest();
  }
  const last = game.level + 1 >= LEVELS.length;
  if (last) clearProgress(); else writeProgress(game.level + 1, game.gold);

  game.mode = 'result';
  showResult({ stars, moves: game.moves, par: def.par, got, total: game.levelGoldTotal, limit, last });
  renderLevelGrid();
}

export function nextLevel() {
  hideResult();
  if (game.level + 1 < LEVELS.length) { loadLevel(game.level + 1); return; }
  game.mode = 'end';
  game.modeTime = 0;
  showEnd();
}

/** Enter / Space: dismiss whichever panel is showing. */
export function confirm() {
  if (game.mode === 'end') playAgain();
  else if (game.mode === 'result') nextLevel();
}

export function update(dt) {
  game.time += dt;
  if (game.fade > 0) game.fade -= dt;
  for (const e of game.effects) e.t += dt;
  if (game.effects.length) game.effects = game.effects.filter((e) => e.t < e.dur);

  if (game.mode === 'dying') {
    game.modeTime += dt;
    if (game.modeTime >= DEATH_TIME) {
      game.gold = game.goldAtLevelStart;                // the fire takes the gold you picked up here
      loadLevel(game.level);
    }
    return;
  }
  if (game.mode === 'exiting') {
    game.modeTime += dt;
    if (game.modeTime >= EXIT_TIME) completeLevel();
    return;
  }
  if (game.mode !== 'play') return;

  let carry = 0;
  if (player.moving) {
    player.t += dt / MOVE_TIME;
    if (player.t < 1) return;
    carry = (player.t - 1) * MOVE_TIME;      // keep the rhythm steady when holding a key
    finishStep();
    if (game.mode !== 'play') return;
  }
  const dir = nextDirection();
  if (dir) startStep(dir, carry);
}
