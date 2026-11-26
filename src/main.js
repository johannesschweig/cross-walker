/*
 * Cross Walker – a tiny tile puzzle game, ported from a Godot 4.3 prototype
 * (the original sources live in the git history).
 *
 * Rules
 *   - You move exactly one tile per step (hold a key / keep your finger down to keep walking).
 *   - Walk onto the door to finish a level. Pick up gold on the way.
 *   - Fire kills you: the level restarts and the gold you picked up in it is lost.
 *   - Water can't be crossed. Push a crate into it and the crate stays there as a floating
 *     bridge you can walk over. Crates can't be pushed onto a bridge, and can't be pulled.
 *   - Push a crate into fire and the crate burns up (the fire stays). That's how you get rid of a
 *     crate you don't need.
 *   - Stars per level: 1 for finishing, 2 for also collecting all its gold, 3 for doing that
 *     within 25% of the level's par (the fewest steps that collect all gold).
 *   - On a keyboard, Z or Backspace takes back your last step (there is no undo button).
 *
 * Controls: arrows / WASD / swipe anywhere on the board / on-screen d-pad. R = restart.
 *
 * This file only connects the modules and runs the main loop:
 *   levels.js  level data           state.js    the mutable game state     config.js   constants
 *   rules.js   one step of play     undo.js     taking back a step         game.js     level flow
 *   input.js   keys, swipes, d-pad  audio.js    music and effects          storage.js  localStorage
 *   render.js  canvas drawing       ui.js       HUD, panels, level picker  dom.js      page elements
 */
import { STEP } from './config.js';
import { el, coarse } from './dom.js';
import { initAudio, toggleMute } from './audio.js';
import { initInput } from './input.js';
import { initRender, loadSprites, draw } from './render.js';
import { openMenu, closeMenu, initDpad, toggleDpad } from './ui.js';
import { undo } from './undo.js';
import { startGame, update, loadLevel, restartLevel, retryLevel, nextLevel, playAgain, confirm } from './game.js';

// Portrait-only: installed apps and fullscreen pages can lock the orientation; everywhere else
// the CSS shows a "turn your phone upright" screen when a phone is held sideways.
try {
  if (coarse && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
} catch (_) { /* not supported or not allowed here */ }

initAudio();
initInput({ undo, restart: restartLevel, toggleMute, confirm });

// Buttons and panels
el.restart.addEventListener('click', restartLevel);
el.sound.addEventListener('click', toggleMute);
el.dpadToggle.addEventListener('click', toggleDpad);
el.again.addEventListener('click', playAgain);
el.resultNext.addEventListener('click', nextLevel);
el.resultRetry.addEventListener('click', retryLevel);
el.levelBtn.addEventListener('click', openMenu);
el.menuClose.addEventListener('click', closeMenu);
el.menu.addEventListener('click', (e) => { if (e.target === el.menu) closeMenu(); });
el.levelGrid.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  closeMenu();
  loadLevel(Number(b.dataset.level));
});

initDpad();
initRender();

// Main loop: fixed-step updates, render every animation frame.
loadSprites().then(([tiles, sprites]) => {
  startGame();
  let last = performance.now(), acc = 0;
  const frame = (now) => {
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    draw(tiles, sprites);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}).catch((err) => {
  document.body.insertAdjacentHTML('beforeend',
    `<p style="color:#fff;font:16px system-ui;position:fixed;top:16px;left:16px">${err.message}</p>`);
});

// Offline support / installable app (production build only). Harmless if it fails.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
