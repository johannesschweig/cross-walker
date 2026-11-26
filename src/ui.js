// The HTML around the canvas: header, level picker, result and end panels, d-pad toggle.
// It only shows things; clicks are wired to game actions in main.js.
import { LEVELS } from './levels.js';
import { el, coarse } from './dom.js';
import { game, goldLeft } from './state.js';
import { best, totalStars } from './storage.js';
import { fitCanvas } from './render.js';

const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function updateHud() {
  const def = LEVELS[game.level];
  el.level.textContent = `Level ${game.level + 1}/${LEVELS.length}`;
  el.title.textContent = def.name;
  el.moves.textContent = `Schritte ${game.moves} · Par ${def.par}`;
  const got = game.levelGoldTotal - goldLeft();
  el.gold.innerHTML = `● ${game.gold}` +
    (game.levelGoldTotal ? `<small>${got}/${game.levelGoldTotal}</small>` : '');
  el.hint.textContent = game.level === 0
    ? (coarse ? 'Tippe auf die Pfeile oder wische über das Spielfeld.' : def.hint)
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
  el.resultTitle.textContent = stars === 3 ? 'Perfekt!' : 'Level geschafft';
  el.resultStars.textContent = starText(stars);
  el.resultInfo.textContent = `${moves} Schritte · Par ${par} · Gold ${got}/${total}`;
  el.resultTip.textContent = stars === 3 ? '' : got < total ? 'Sammle alles Gold für ★★.'
    : `Sammle alles Gold in höchstens ${limit} Schritten für ★★★.`;
  el.resultNext.textContent = last ? 'Fertig' : 'Nächstes Level';
  el.result.hidden = false;
  el.resultNext.focus({ preventScroll: true });
}
export const hideResult = () => { el.result.hidden = true; };

export function showEnd() {
  el.endGold.textContent = `● ${game.gold} Gold · ★ ${totalStars()}/${LEVELS.length * 3}`;
  el.end.hidden = false;
}
export const hideEnd = () => { el.end.hidden = true; };

// ---- D-pad ------------------------------------------------------------------------------------
// Shown on touch screens only (always there, no switch); on a laptop the keyboard is the control.
export function initDpad() {
  el.dpad.hidden = !coarse;
  document.body.classList.toggle('dpad-on', coarse);
  requestAnimationFrame(fitCanvas);
}
