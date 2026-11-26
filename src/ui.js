// The HTML around the canvas: header, level picker, result and end panels, d-pad toggle.
// It only shows things; clicks are wired to game actions in main.js.
import { LEVELS } from './levels.js';
import { el, coarse } from './dom.js';
import { game, goldLeft } from './state.js';
import { best, totalStars, getFlag, setFlag } from './storage.js';
import { clearInput } from './input.js';
import { fitCanvas } from './render.js';

const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// Optional on-screen direction pad (the default control on phones is swiping on the board).
let dpadOn = getFlag('cw-dpad');

export function updateHud() {
  const def = LEVELS[game.level];
  el.level.textContent = `Level ${game.level + 1}/${LEVELS.length}`;
  el.title.textContent = def.name;
  el.moves.textContent = `Steps ${game.moves} · par ${def.par}`;
  const got = game.levelGoldTotal - goldLeft();
  el.gold.innerHTML = `● ${game.gold}` +
    (game.levelGoldTotal ? `<small>${got}/${game.levelGoldTotal}</small>` : '');
  el.hint.textContent = game.level === 0
    ? (dpadOn ? 'Use the arrows to walk.' : coarse ? 'Swipe anywhere on the board to walk.' : def.hint)
    : def.hint;
}

// ---- Level picker -----------------------------------------------------------------------------
export function renderLevelGrid() {
  el.levelGrid.textContent = '';
  LEVELS.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.level = i;
    const n = best[i] ? best[i].stars : 0;
    b.innerHTML = `<b>${i + 1}</b><small>${starText(n)}</small>`;
    if (i === game.level) b.className = 'current';
    el.levelGrid.appendChild(b);
  });
}
export const openMenu = () => { el.menu.hidden = false; };
export const closeMenu = () => { el.menu.hidden = true; };

// ---- Result and end panels ----------------------------------------------------------------------
export function showResult({ stars, moves, par, got, total, limit, last }) {
  el.resultTitle.textContent = stars === 3 ? 'Perfect!' : 'Level complete';
  el.resultStars.textContent = starText(stars);
  el.resultInfo.textContent = `${moves} steps · par ${par} · gold ${got}/${total}`;
  el.resultTip.textContent = stars === 3 ? '' : got < total ? 'Collect all the gold for ★★.'
    : `Collect all the gold in ${limit} steps or fewer for ★★★.`;
  el.resultNext.textContent = last ? 'Finish' : 'Next level';
  el.result.hidden = false;
  el.resultNext.focus({ preventScroll: true });
}
export const hideResult = () => { el.result.hidden = true; };

export function showEnd() {
  el.endGold.textContent = `● ${game.gold} gold · ★ ${totalStars()}/${LEVELS.length * 3}`;
  el.end.hidden = false;
}
export const hideEnd = () => { el.end.hidden = true; };

// ---- D-pad ------------------------------------------------------------------------------------
export function setDpad(on) {
  dpadOn = on;
  setFlag('cw-dpad', on);
  el.dpad.hidden = !on;
  el.dpadToggle.classList.toggle('on', on);
  el.dpadToggle.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('dpad-on', on);
  clearInput();
  if (game.grid.length) updateHud();
  requestAnimationFrame(fitCanvas);
}
export const initDpad = () => setDpad(dpadOn);
export const toggleDpad = () => setDpad(!dpadOn);
