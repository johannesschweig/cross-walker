// Everything kept in localStorage. Each call is wrapped in try/catch because storage can be
// unavailable (private windows, blocked site data); the game then simply doesn't remember.
//   cw-progress  next level + gold at its start     cw-stars  best stars and steps per level
//   cw-muted     sound off                          cw-dpad   on-screen d-pad shown
import { LEVELS } from './levels.js';

// ---- Progress (remembered between visits) ----------------------------------------------------
const PROGRESS_KEY = 'cw-progress';

export function writeProgress(level, gold) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ level, gold }));
  } catch (_) { /* storage unavailable */ }
}

export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (p && Number.isInteger(p.level) && p.level >= 0 && p.level < LEVELS.length) {
      return { level: p.level, gold: Math.max(0, p.gold | 0) };
    }
  } catch (_) { /* ignore */ }
  return null;
}

export function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (_) { /* ignore */ }
}

// ---- Best result per level: { [levelIndex]: { stars, moves } } -----------------------------------
const STARS_KEY = 'cw-stars';

export const best = {};
try { Object.assign(best, JSON.parse(localStorage.getItem(STARS_KEY) || '{}')); } catch (_) { /* ignore */ }

export const saveBest = () => {
  try { localStorage.setItem(STARS_KEY, JSON.stringify(best)); } catch (_) { /* ignore */ }
};
export const totalStars = () => Object.values(best).reduce((n, b) => n + (b.stars | 0), 0);

// ---- Simple on/off settings ------------------------------------------------------------------
export function getFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch (_) { return false; }
}
export function setFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch (_) { /* ignore */ }
}
