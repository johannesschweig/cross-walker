// Keyboard, swipe/drag on the board and the on-screen d-pad. They all end up in press()/release().
// This module doesn't know the game rules: the game asks for the next direction each step, and
// keys that do something else (undo, restart, ...) are passed in as `actions` by main.js.
import { SWIPE_DIST } from './config.js';
import { el, menuOpen } from './dom.js';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

// `held` is the list of directions currently pressed (latest last). `queued` remembers a
// direction pressed while a step was still in progress, so quick taps and flicks are never lost.
const held = [];
let queued = null;

export function press(dir) {
  const i = held.indexOf(dir);
  if (i >= 0) held.splice(i, 1);
  held.push(dir);
  queued = dir;
}
export function release(dir) {
  const i = held.indexOf(dir);
  if (i >= 0) held.splice(i, 1);
}
export function nextDirection() {
  const d = queued || held[held.length - 1] || null;
  queued = null;
  return d;
}
/** Forget everything pressed, so the player has to press a key again (after a restart, death, ...). */
export function clearInput() { held.length = 0; queued = null; }
/** Forget a direction that was queued but not started yet. */
export function clearQueued() { queued = null; }

/** actions: { undo, restart, toggleMute, confirm } */
export function initInput(actions) {
  // Swipe / drag anywhere on the board: move the finger away from where it touched down and the
  // game keeps walking that way until the finger comes back or lifts. A short flick = one step.
  let touch = null;
  el.stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!menuOpen()) touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dir: null };
    try { el.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    e.preventDefault();
  });
  el.stage.addEventListener('pointermove', (e) => {
    if (!touch || touch.id !== e.pointerId) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    let dir = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_DIST) {
      dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    if (dir === touch.dir) return;
    if (touch.dir) release(touch.dir);
    touch.dir = dir;
    if (dir) press(dir);
  });
  const endTouch = (e) => {
    if (!touch || touch.id !== e.pointerId) return;
    if (touch.dir) release(touch.dir);
    touch = null;
  };
  el.stage.addEventListener('pointerup', endTouch);
  el.stage.addEventListener('pointercancel', endTouch);
  // iOS Safari: stop the page from scrolling / zooming under the finger
  el.stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // On-screen direction pad: hold a button to keep walking, tap for one step.
  el.dpad.querySelectorAll('button').forEach((btn) => {
    const dir = btn.dataset.dir;
    const down = (e) => {
      if (menuOpen()) return;
      press(dir);
      btn.classList.add('down');
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      e.preventDefault();
    };
    const up = (e) => { release(dir); btn.classList.remove('down'); e.preventDefault(); };
    btn.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, up));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  addEventListener('keydown', (e) => {
    if (menuOpen()) { if (e.code === 'Escape') el.menu.hidden = true; return; }
    const k = KEYMAP[e.code];
    if (k) { if (!e.repeat) press(k); e.preventDefault(); return; }
    if (e.code === 'KeyZ' || e.code === 'Backspace') { actions.undo(); e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'KeyR') actions.restart();
    else if (e.code === 'KeyM') actions.toggleMute();
    else if (e.code === 'Enter' || e.code === 'Space') {
      actions.confirm();
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) release(k);
  });
  addEventListener('blur', () => { clearInput(); touch = null; });
}
