// Drawing. Reads the game state, never changes it. Everything here is visual only.
import tilesUrl from './assets/tilesheet.png';
import spritesUrl from './assets/spritesheet.png';
import { SRC, SPR, FRAMES, DEATH_TIME, EXIT_TIME, FADE_TIME } from './config.js';
import { canvas, ctx, el } from './dom.js';
import { game, player } from './state.js';

// The canvas is sized to the space on screen; a level is drawn as large as fits, centred.
export function fitCanvas() {
  const box = el.stage.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const px = Math.max(120, Math.floor(Math.min(box.width, box.height) * dpr));
  canvas.style.width = canvas.style.height = (px / dpr) + 'px';   // exactly 1 canvas px per device px
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
}

export function initRender() {
  new ResizeObserver(fitCanvas).observe(el.stage);
  addEventListener('resize', fitCanvas);
  addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));
  fitCanvas();
}

function load(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load ' + src));
    img.src = src;
  });
}
export const loadSprites = () => Promise.all([load(tilesUrl), load(spritesUrl)]);

// Small deterministic pseudo-random number in 0..1 for a tile, so every tile animates out of step.
const hash = (x, y, k = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
const scratch = document.createElement('canvas');   // used to tint burning crates
const scratchCtx = scratch.getContext('2d');

export function draw(tilesheet, spritesheet) {
  // Everything is drawn in device pixels with a whole number of pixels per tile, so tiles
  // meet exactly (no hairline seams) and the pixel art stays crisp at any screen size.
  const V = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, V, V);

  const T = Math.floor(V / Math.max(game.w, game.h));      // tile size in device pixels
  const ox = Math.floor((V - game.w * T) / 2);
  const oy = Math.floor((V - game.h * T) / 2);
  const px = (gx) => ox + Math.round(gx * T);
  const py = (gy) => oy + Math.round(gy * T);
  const time = game.time;

  const sprite = (name, x, y, w = T, h = T) => {
    const [c, r] = SPR[name];
    ctx.drawImage(tilesheet, c * SRC, r * SRC, SRC, SRC, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const cell = (name, gx, gy) => sprite(name, px(gx), py(gy));

  // Water: two light ripples drift slowly across the tile, and now and then a pixel sparkles.
  const waterFx = (tx, ty) => {
    const x0 = px(tx), y0 = py(ty);
    const w = Math.max(2, Math.round(T * 0.28)), h = Math.max(1, Math.round(T * 0.045));
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let k = 0; k < 2; k++) {
      const ph = hash(tx, ty, k) * 6.28;
      const xx = x0 + Math.round((T - w) * (0.5 + 0.5 * Math.sin(time * 0.9 + ph)));
      const yy = y0 + Math.round(T * (0.26 + 0.42 * k) + Math.sin(time * 1.3 + ph) * T * 0.03);
      ctx.fillRect(xx, yy, w, h);
    }
    const s = (time * 0.45 + hash(tx, ty, 3)) % 1;
    if (s < 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * Math.sin((s / 0.3) * Math.PI)})`;
      const sz = Math.max(1, Math.round(T * 0.05));
      ctx.fillRect(x0 + Math.round(T * (0.15 + 0.7 * hash(tx, ty, 4))), y0 + Math.round(T * (0.15 + 0.7 * hash(tx, ty, 5))), sz, sz);
    }
  };

  // Cracked floor ('x') and broken floor ('X'), drawn on top of a floor tile on an 8x8 grid of
  // chunky pixels. Cracked = one thin dark crack; broken = a wider web of cracks with dark gaps,
  // so it reads at a glance as "won't hold another visit". Mirrored per tile so they don't all match.
  const CRACK = [[0, 3], [1, 3], [2, 3], [2, 4], [3, 4], [4, 4], [4, 5], [5, 5], [6, 5], [6, 6], [7, 6],
    [4, 3], [5, 3], [5, 2], [6, 2], [6, 1]];
  const BREAK = [[2, 2], [2, 1], [3, 1], [3, 0], [3, 5], [3, 6], [2, 6], [2, 7], [6, 4], [7, 4], [1, 4], [1, 5]];
  const GAPS = [[2, 3], [2, 4], [3, 4], [4, 4], [4, 5], [5, 5], [3, 5]];
  const gridCells = (list, x0, y0, flip, color) => {
    const u = T / 8;
    ctx.fillStyle = color;
    for (const [c, r] of list) {
      const cx = flip ? 7 - c : c;
      const xa = Math.round(x0 + cx * u), ya = Math.round(y0 + r * u);
      ctx.fillRect(xa, ya, Math.round(x0 + (cx + 1) * u) - xa, Math.round(y0 + (r + 1) * u) - ya);
    }
  };
  const crackFx = (tx, ty, broken) => {
    const x0 = px(tx), y0 = py(ty), flip = hash(tx, ty, 9) > 0.5;
    if (broken) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(x0, y0, T, T);
    }
    gridCells(CRACK, x0, y0, flip, 'rgba(62,54,54,0.9)');
    if (broken) {
      gridCells(BREAK, x0, y0, flip, 'rgba(62,54,54,0.9)');
      gridCells(GAPS, x0, y0, flip, '#1d1714');
    }
  };

  // Floor tile that just broke further: a few chunks fall away as dust.
  const crumbleFx = (e) => {
    const k = e.t / e.dur;
    const x0 = px(e.gx), y0 = py(e.gy);
    const sz = Math.max(2, Math.round(T * 0.09));
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(${i % 2 ? '120,112,108' : '70,62,60'},${Math.max(0, 1 - k)})`;
      ctx.fillRect(
        Math.round(x0 + (0.15 + 0.7 * hash(i, 11)) * T),
        Math.round(y0 + (0.2 + 0.5 * hash(i, 12)) * T + k * k * T * 0.3), sz, sz);
    }
  };

  // Fire: a soft glow, a flame that breathes (smooth, bottom-anchored) and two rising embers.
  const fireFx = (tx, ty) => {
    const x0 = px(tx), y0 = py(ty), ph = hash(tx, ty) * 6.28;
    const cx = x0 + T / 2, cy = y0 + T * 0.62;
    const glow = ctx.createRadialGradient(cx, cy, T * 0.05, cx, cy, T * 0.8);
    const a = 0.2 + 0.05 * Math.sin(time * 2.2 + ph);
    glow.addColorStop(0, `rgba(255,150,40,${a})`);
    glow.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - T, cy - T, 2 * T, 2 * T);
    const s = Math.sin(time * 4 + ph);
    const h = T * (1 + 0.05 * s), w = T * (1 - 0.025 * s);
    sprite('fire', x0 + (T - w) / 2, y0 + T - h, w, h);
    const sz = Math.max(1, Math.round(T * 0.05));
    for (let k = 0; k < 2; k++) {
      const p = (time * 0.7 + hash(tx, ty, k + 5)) % 1;
      ctx.fillStyle = `rgba(255,${210 - Math.round(p * 100)},60,${(1 - p) * 0.9})`;
      ctx.fillRect(Math.round(cx + Math.sin(p * 7 + k * 3 + ph) * T * 0.14), Math.round(y0 + T * 0.55 - p * T * 0.55), sz, sz);
    }
  };

  // A crate that was pushed into fire: it chars, shrinks and burns away in a burst of embers.
  const burnFx = (e) => {
    const k = e.t / e.dur;
    const x0 = px(e.gx), y0 = py(e.gy);
    const cx = x0 + T / 2, cy = y0 + T / 2;
    if (scratch.width !== T) scratch.width = scratch.height = T;
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.clearRect(0, 0, T, T);
    scratchCtx.drawImage(tilesheet, SPR.crate[0] * SRC, SPR.crate[1] * SRC, SRC, SRC, 0, 0, T, T);
    scratchCtx.globalCompositeOperation = 'source-atop';
    scratchCtx.fillStyle = `rgba(15,8,0,${Math.min(0.9, k * 1.6)})`;
    scratchCtx.fillRect(0, 0, T, T);
    const sz = Math.round(T * (1 - 0.45 * k));
    ctx.save();
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    ctx.drawImage(scratch, Math.round(x0 + (T - sz) / 2), Math.round(y0 + T - sz), sz, sz);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.sin(Math.min(1, k * 1.2) * Math.PI));
    const fh = T * (1.05 + 0.25 * k), fw = T * (1 + 0.1 * k);
    sprite('fire', x0 + (T - fw) / 2, y0 + T - fh, fw, fh);
    ctx.restore();
    const dot = Math.max(2, Math.round(T * 0.07));
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (hash(i, 1) - 0.5) * 2.2;
      const dist = (0.3 + hash(i, 2) * 0.8) * T * k;
      ctx.fillStyle = `rgba(255,${190 - Math.round(hash(i, 3) * 90)},50,${Math.max(0, 1 - k)})`;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * dist), Math.round(cy + Math.sin(ang) * dist + k * k * T * 0.5), dot, dot);
    }
  };

  // 1. base tiles
  for (let ty = 0; ty < game.h; ty++) {
    for (let tx = 0; tx < game.w; tx++) {
      const ch = game.grid[ty][tx];
      if (ch === '#') cell('brick', tx, ty);
      else if (ch === '~' || ch === 'w') cell('water', tx, ty);
      else {
        cell('floor', tx, ty);
        if (ch === 'g') cell('gold', tx, ty);
        else if (ch === 'D') cell('door', tx, ty);
        else if (ch === 'x' || ch === 'X') crackFx(tx, ty, ch === 'X');
      }
    }
  }

  // 2. things that move on their own: water, floating crates, fire
  for (let ty = 0; ty < game.h; ty++) {
    for (let tx = 0; tx < game.w; tx++) {
      const ch = game.grid[ty][tx];
      if (ch === '~') waterFx(tx, ty);
      else if (ch === 'w') {                    // crate floating on water: bobs gently
        waterFx(tx, ty);
        const bob = Math.round(Math.sin(time * 2 + hash(tx, ty) * 6.28) * T * 0.025);
        ctx.fillStyle = '#e3c9a0';              // plank colour, so the crate reads clearly on blue
        const pad = Math.round(T * 0.125);
        ctx.fillRect(px(tx) + pad, py(ty) + pad + bob, T - 2 * pad, T - 2 * pad);
        sprite('crate', px(tx), py(ty) + bob);
      } else if (ch === 'F') fireFx(tx, ty);
    }
  }

  for (const e of game.effects) {
    if (e.type === 'burn') burnFx(e);
    else if (e.type === 'crumble') crumbleFx(e);
  }

  const t = player.moving ? Math.min(1, player.t) : 1;
  for (const c of game.crates) {
    const k = c === player.pushed ? t : 0;
    cell('crate', c.gx + (c.toX - c.gx) * k, c.gy + (c.toY - c.gy) * k);
  }

  // 3. the player
  const sx = px(player.fromX + (player.gx - player.fromX) * t);
  const sy = py(player.fromY + (player.gy - player.fromY) * t);
  const frame = player.moving ? 1 + (player.steps % (FRAMES - 1)) : 0;
  if (game.mode === 'dying') {
    const k = game.modeTime / DEATH_TIME;
    const collapse = game.deathCause === 'collapse';
    if (collapse) {                         // the floor gives way: a dark hole opens under the player
      const s = Math.round(T * (0.35 + 0.65 * Math.min(1, k * 2.5)));
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(px(player.gx) + Math.round((T - s) / 2), py(player.gy) + Math.round((T - s) / 2), s, s);
    }
    ctx.save();
    ctx.translate(sx + T / 2, sy + T / 2);
    if (!collapse) ctx.rotate(k * 10);      // burning: spin; falling: just shrink into the hole
    ctx.scale(1 - k * (collapse ? 0.9 : 0.6), 1 - k * (collapse ? 0.9 : 0.6));
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(spritesheet, 0, 0, SRC, SRC, -T / 2, -T / 2, T, T);
    ctx.restore();
  } else if (game.mode === 'exiting') {
    // The door lights up and the player shrinks into it, as if walking inside.
    const k = Math.min(1, game.modeTime / EXIT_TIME);
    const dx0 = px(player.gx), dy0 = py(player.gy);
    ctx.fillStyle = `rgba(255,236,160,${0.8 * Math.sin(Math.min(1, k * 1.1) * Math.PI)})`;
    ctx.fillRect(dx0 + Math.round(T * 0.2), dy0 + Math.round(T * 0.25), Math.round(T * 0.6), Math.round(T * 0.75));
    ctx.save();
    ctx.translate(dx0 + T / 2, dy0 + T / 2 - T * 0.12 * k);
    ctx.scale(1 - 0.75 * k, 1 - 0.75 * k);
    ctx.globalAlpha = 1 - k * k;
    ctx.drawImage(spritesheet, 0, 0, SRC, SRC, -T / 2, -T / 2, T, T);
    ctx.restore();
    const dot = Math.max(2, Math.round(T * 0.06));
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.4;
      const dist = (0.2 + 0.55 * k) * T;
      ctx.fillStyle = `rgba(255,240,170,${Math.sin(k * Math.PI)})`;
      ctx.fillRect(Math.round(dx0 + T / 2 + Math.cos(ang) * dist), Math.round(dy0 + T * 0.6 + Math.sin(ang) * dist), dot, dot);
    }
  } else if (game.mode === 'play') {
    ctx.drawImage(spritesheet, frame * SRC, 0, SRC, SRC, sx, sy, T, T);
  }

  if (game.mode === 'dying' && game.deathCause !== 'collapse') {
    ctx.fillStyle = `rgba(255,60,0,${0.35 * (1 - game.modeTime / DEATH_TIME)})`;
    ctx.fillRect(0, 0, V, V);
  }
  if (game.fade > 0) {
    ctx.fillStyle = `rgba(43,43,43,${Math.min(1, game.fade / FADE_TIME)})`;
    ctx.fillRect(0, 0, V, V);
  }
}
