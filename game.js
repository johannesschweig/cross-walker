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
 */
(() => {
  'use strict';

  const SRC = 32;               // tile size in the art (assets/tilesheet.png)
  const STEP = 1 / 60;          // fixed update step

  const MOVE_TIME = 0.12;       // s per tile (walking and pushing)
  const DEATH_TIME = 0.8;       // s of death animation before the level restarts
  const FADE_TIME = 0.35;       // s fade-in when a level starts
  const SWIPE_DIST = 16;        // css px a finger has to travel before it counts as a direction
  const UNDO_LIMIT = 400;
  const EXIT_TIME = 0.65;       // s the player takes to walk into the door
  const BURN_TIME = 0.8;        // s a crate takes to burn up
  const THREE_STAR_SLACK = 1.25; // 3 stars: all gold within par * this many steps

  // ---- Levels -------------------------------------------------------------------------------
  // #  brick (solid)     .  floor            S  start
  // ~  water (solid)     g  gold             D  door (level goal)
  // F  fire (deadly)     c  crate (pushable)
  // Internally a filled water tile becomes 'w' (water with a floating crate; walkable).
  // `par` = fewest steps that collect all gold and reach the door.
  // `node tools/check-levels.js` verifies every level (solvable, all gold collectable, par).
  const LEVELS = [
  {
    name: "First Steps",
    hint: "Collect the gold and reach the door.",
    par: 13,
    rows: [
      "########",
      "#S.....#",
      "#.####.#",
      "#.#g...#",
      "#.#.####",
      "#g..g.D#",
      "########",
    ],
  },
  {
    name: "Warm Hands",
    hint: "Fire burns. Touch it and the level starts over.",
    par: 16,
    rows: [
      "########",
      "#S.....#",
      "#.F.F..#",
      "#..g.F.#",
      "#F.....#",
      "#..F.g.#",
      "#g...FD#",
      "########",
    ],
  },
  {
    name: "Splash",
    hint: "Push a crate into water to make a bridge.",
    par: 10,
    rows: [
      "#########",
      "#S...~.D#",
      "#.c..~..#",
      "#....~.g#",
      "#########",
    ],
  },
  {
    name: "Corner Pocket",
    hint: "Crates only go straight. Plan your turns.",
    par: 18,
    rows: [
      "########",
      "#S.....#",
      "#.c.F..#",
      "#......#",
      "#.g..F.#",
      "###~####",
      "#g....D#",
      "########",
    ],
  },
  {
    name: "Burn It",
    hint: "Fire eats crates. Use it to clear the way.",
    par: 20,
    rows: [
      "#########",
      "#S.....g#",
      "####.####",
      "#D..c..g#",
      "####F####",
      "#########",
    ],
  },
  {
    name: "Too Many Crates",
    hint: "You don't need them all. Fire can get rid of one.",
    par: 23,
    rows: [
      "##########",
      "#S.F.Fcg.#",
      "#.....c.F#",
      "#.Fcg....#",
      "###~##~###",
      "#.g.#...D#",
      "##########",
    ],
  },
  {
    name: "Two Gates",
    hint: "Only one gate leads to the door. The other hides gold.",
    par: 25,
    rows: [
      "##########",
      "#S.gF...g#",
      "#..c.Fc..#",
      "#...g...F#",
      "###~##~###",
      "#.g.#c..D#",
      "##########",
    ],
  },
  {
    name: "Moat",
    hint: "The door is an island. Where to build the bridge?",
    par: 24,
    rows: [
      "##########",
      "#S.c....F#",
      "#.....gc.#",
      "#.F~~~.g.#",
      "#..~D~FgF#",
      "#..~~~..g#",
      "#c.FF....#",
      "##########",
    ],
  },
  {
    name: "Two Rivers",
    hint: "Each river needs its own crate.",
    par: 26,
    rows: [
      "###########",
      "#S.g~.gF~.#",
      "#.g.~c.F~.#",
      "#c..~...~.#",
      "#.gc~..F~.#",
      "#F..~...~D#",
      "###########",
    ],
  },
  {
    name: "Crate Jam",
    hint: "Three crates side by side. They can't all be useful.",
    par: 31,
    rows: [
      "##########",
      "#S..F.F..#",
      "#..cccg..#",
      "#..g.F...#",
      "###~##~###",
      "#.g.#...D#",
      "##########",
    ],
  },
  {
    name: "Island Hop",
    hint: "Fire guards the shore.",
    par: 28,
    rows: [
      "##########",
      "#S.gF...c#",
      "#...gc.F.#",
      "#..~~~.g.#",
      "#.g~D~F..#",
      "#..~~~...#",
      "#.c......#",
      "##########",
    ],
  },
  {
    name: "Long River",
    hint: "Take your time. Think a few pushes ahead.",
    par: 32,
    rows: [
      "###########",
      "#S..~..g~F#",
      "#.cg~c..~.#",
      "#gc.~g.F~F#",
      "#Fc.~F..~.#",
      "#...~...~D#",
      "###########",
    ],
  },
  {
    name: "Grand Tour",
    hint: "A river, then an island. Two crates, two crossings.",
    par: 46,
    rows: [
      "############",
      "#S..~...F.F#",
      "#.c.~c~~~g.#",
      "#..c~.~D~..#",
      "#.cF~.~~~.F#",
      "#..g~....gF#",
      "############",
    ],
  },
  ];

  const SPR = {
    water: [0, 0], brick: [1, 0], floor: [3, 0],
    crate: [0, 1], gold: [0, 2], fire: [1, 2], door: [2, 2],
  };
  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const FRAMES = 5;             // sprite sheet has 5 poses; frame 0 is the standing pose

  // ---- DOM ---------------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const el = {
    level: $('level'), title: $('title'), gold: $('gold'), hint: $('hint'),
    stage: $('stage'), menu: $('menu'), levelGrid: $('levelGrid'),
    end: $('end'), endGold: $('endGold'), sound: $('sound'),
    dpad: $('dpad'), dpadToggle: $('dpadToggle'),
    moves: $('moves'), result: $('result'), resultTitle: $('resultTitle'), resultStars: $('resultStars'),
    resultInfo: $('resultInfo'), resultTip: $('resultTip'), resultNext: $('resultNext'), resultRetry: $('resultRetry'),
  };
  const coarse = matchMedia('(pointer: coarse)').matches;

  // Portrait-only: installed apps and fullscreen pages can lock the orientation; everywhere else
  // the CSS shows a "turn your phone upright" screen when a phone is held sideways.
  try {
    if (coarse && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }
  } catch (_) { /* not supported or not allowed here */ }

  // Optional on-screen direction pad (the default control on phones is swiping on the board).
  let dpadOn = false;
  try { dpadOn = localStorage.getItem('cw-dpad') === '1'; } catch (_) { /* storage unavailable */ }

  // ---- Game state ------------------------------------------------------------------------------
  const player = {
    gx: 0, gy: 0,                 // tile we are on (or moving to)
    fromX: 0, fromY: 0,           // tile we started the current step on
    t: 1, moving: false,          // progress of the current step, 0..1
    pushed: null,                 // crate being pushed during this step
    steps: 0,
  };

  const game = {
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

  const tileAt = (tx, ty) => (game.grid[ty] && game.grid[ty][tx]) || '#';
  const crateAt = (gx, gy) => game.crates.find((c) => c.gx === gx && c.gy === gy);
  const goldLeft = () => game.grid.reduce((n, row) => n + row.filter((c) => c === 'g').length, 0);

  // ---- Progress (remembered between visits) ------------------------------------------------------
  const PROGRESS_KEY = 'cw-progress';
  function writeProgress(level, gold) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ level, gold }));
    } catch (_) { /* storage unavailable */ }
  }
  const saveProgress = () => writeProgress(game.level, game.goldAtLevelStart);
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
      if (p && Number.isInteger(p.level) && p.level >= 0 && p.level < LEVELS.length) {
        return { level: p.level, gold: Math.max(0, p.gold | 0) };
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (_) { /* ignore */ }
  }

  // Best result per level: { [levelIndex]: { stars, moves } }
  const STARS_KEY = 'cw-stars';
  let best = {};
  try { best = JSON.parse(localStorage.getItem(STARS_KEY) || '{}') || {}; } catch (_) { best = {}; }
  const saveBest = () => { try { localStorage.setItem(STARS_KEY, JSON.stringify(best)); } catch (_) { /* ignore */ } };
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const totalStars = () => Object.values(best).reduce((n, b) => n + (b.stars | 0), 0);

  // ---- HUD ---------------------------------------------------------------------------------------
  function updateHud() {
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

  // ---- Level loading -----------------------------------------------------------------------------
  function loadLevel(index, { fresh = true } = {}) {
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
    held.length = 0; queued = null;     // make the player press a key again after (re)starting
    game.undo = [];
    game.moves = 0;
    game.effects = [];
    el.result.hidden = true;
    game.goldAtLevelStart = game.gold;
    game.levelGoldTotal = goldLeft();
    game.mode = 'play';
    game.modeTime = 0;
    if (fresh) game.fade = FADE_TIME;
    el.end.hidden = true;
    saveProgress();
    updateHud();
    renderLevelGrid();
  }

  function newGame() {
    game.gold = 0;
    loadLevel(0);
  }

  // ---- Audio -----------------------------------------------------------------------------------
  let muted = false;
  try { muted = localStorage.getItem('cw-muted') === '1'; } catch (_) { /* storage unavailable */ }

  const MUSIC_SRC = 'assets/sounds/music-web.mp3';
  const MUSIC_VOL = 0.35;
  const music = new Audio(MUSIC_SRC);
  music.loop = true;
  music.volume = MUSIC_VOL;
  music.preload = 'none';       // don't spend mobile data before the player has interacted
  const fireSound = new Audio('assets/sounds/fire.mp3');
  fireSound.volume = 0.7;

  // 'waiting' = browser needs a tap first, 'playing', or 'failed'.
  let musicStatus = 'waiting';
  let bufferMusic = null;       // set when the Web Audio fallback below is running
  let audioCtx = null;
  let audioStarted = false;

  const musicErrors = [];
  const musicFail = (why) => {
    musicErrors.push(why);
    console.warn('Cross Walker music:', why);
    el.sound.title = `Music problem: ${location.protocol} ${musicErrors.join(' → ')}`;
  };

  music.addEventListener('playing', () => { musicStatus = 'playing'; });
  // Some environments can't stream the mp3 through an <audio> element: Safari with servers that
  // lack byte-range support, file:// pages, static previews. Then we load the track as plain
  // script data (assets/sounds/music-data.js, built by tools/make-music-data.sh) and play it
  // through Web Audio, which needs no network access.
  music.addEventListener('error', () => {
    musicFail('player error ' + (music.error ? music.error.code : '?'));
    if (audioCtx) startBufferMusic();     // otherwise this happens on the first tap
  });

  function loadEmbeddedMusic() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/sounds/music-data.js';
      script.onload = () => {
        const bin = atob(window.CW_MUSIC || '');
        if (!bin) { reject(new Error('music-data.js is empty')); return; }
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        window.CW_MUSIC = null;                       // free the big string
        resolve(bytes.buffer);
      };
      script.onerror = () => reject(new Error('could not load music-data.js'));
      document.head.appendChild(script);
    });
  }

  async function startBufferMusic() {
    if (bufferMusic) return;
    if (!audioCtx) { musicFail('Web Audio is not available'); musicStatus = 'failed'; return; }
    bufferMusic = {};
    try {
      const data = await loadEmbeddedMusic();
      const src = audioCtx.createBufferSource();
      src.buffer = await audioCtx.decodeAudioData(data);
      src.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = muted ? 0 : MUSIC_VOL;
      src.connect(gain).connect(audioCtx.destination);
      src.start();
      bufferMusic.gain = gain;
      musicStatus = 'playing';
    } catch (err) {
      bufferMusic = null;
      musicStatus = 'failed';
      musicFail('fallback: ' + ((err && err.message) || err));
    }
  }

  function blip(freqs, len, vol) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, t0 + (i * len) / freqs.length));
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + len);
  }
  const sfx = {
    gold: () => blip([880, 1320], 0.12, 0.05),
    push: () => blip([110, 90], 0.08, 0.06),
    splash: () => blip([300, 200, 140], 0.2, 0.05),
    win: () => blip([523, 659, 784, 1047], 0.4, 0.05),
    undo: () => blip([300, 220], 0.06, 0.04),
    burn: () => blip([700, 420, 640, 260, 480, 180], 0.45, 0.05),
    fire: () => { if (muted) return; fireSound.currentTime = 0; fireSound.play().catch(() => {}); },
  };

  // Browsers only allow sound after a tap / key press, so the music starts on the first input.
  // (iOS only accepts touchend / click as a gesture, which is why we listen for those too.)
  function startAudio() {
    audioStarted = true;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (bufferMusic || muted || !music.paused) return;
    music.play().catch((err) => {
      if (err.name === 'NotAllowedError') return;                // needs a gesture: try again later
      musicFail(err.name + ': ' + err.message);
      startBufferMusic();
    });
  }
  function updateSoundButton() {
    el.sound.classList.toggle('off', muted);
    el.sound.setAttribute('aria-pressed', String(!muted));
  }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('cw-muted', m ? '1' : '0'); } catch (_) { /* ignore */ }
    if (bufferMusic && bufferMusic.gain) bufferMusic.gain.gain.value = muted ? 0 : MUSIC_VOL;
    else if (muted) music.pause();
    else startAudio();
    updateSoundButton();
  }
  // Pause everything while the page is in the background (phones: screen off / app switch).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!music.paused) music.pause();
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else if (audioStarted && !muted) {
      startAudio();
    }
  });
  ['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) =>
    addEventListener(ev, () => { if (!audioStarted) startAudio(); }, { passive: true }));
  updateSoundButton();

  // ---- Input -----------------------------------------------------------------------------------
  // `held` is the list of directions currently pressed (latest last). `queued` remembers a
  // direction pressed while a step was still in progress, so quick taps and flicks are never lost.
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  const held = [];
  let queued = null;

  function press(dir) {
    const i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
    held.push(dir);
    queued = dir;
  }
  function release(dir) {
    const i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
  }
  function nextDirection() {
    const d = queued || held[held.length - 1] || null;
    queued = null;
    return d;
  }

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
  function setDpad(on) {
    dpadOn = on;
    try { localStorage.setItem('cw-dpad', on ? '1' : '0'); } catch (_) { /* ignore */ }
    el.dpad.hidden = !on;
    el.dpadToggle.classList.toggle('on', on);
    el.dpadToggle.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('dpad-on', on);
    for (const d of Object.keys(DIRS)) release(d);
    if (game.grid.length) updateHud();
    requestAnimationFrame(fitCanvas);
  }
  el.dpadToggle.addEventListener('click', () => setDpad(!dpadOn));
  setDpad(dpadOn);

  // ---- Undo / restart ----------------------------------------------------------------------------
  function snapshot() {
    return {
      rows: game.grid.map((r) => r.join('')),
      crates: game.crates.map((c) => [c.gx, c.gy]),
      gx: player.gx, gy: player.gy,
      gold: game.gold,
      moves: game.moves,
    };
  }
  function undo() {
    if (game.mode !== 'play' || !game.undo.length) return;
    const s = game.undo.pop();
    game.grid = s.rows.map((r) => r.split(''));
    game.crates = s.crates.map(([gx, gy]) => ({ gx, gy, toX: gx, toY: gy }));
    player.gx = player.fromX = s.gx;
    player.gy = player.fromY = s.gy;
    player.t = 1; player.moving = false; player.pushed = null;
    game.gold = s.gold;
    game.moves = s.moves;
    game.effects = [];
    queued = null;
    sfx.undo();
    updateHud();
  }
  function restartLevel() {
    if (game.mode !== 'play') return;
    game.gold = game.goldAtLevelStart;
    loadLevel(game.level, { fresh: false });
  }

  // Buttons
  $('restart').addEventListener('click', restartLevel);
  el.sound.addEventListener('click', () => setMuted(!muted));
  $('again').addEventListener('click', () => { clearProgress(); newGame(); });

  // Level picker
  const menuOpen = () => !el.menu.hidden;
  function renderLevelGrid() {
    el.levelGrid.textContent = '';
    LEVELS.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const n = best[i] ? best[i].stars : 0;
      b.innerHTML = `<b>${i + 1}</b><small>${starText(n)}</small>`;
      if (i === game.level) b.className = 'current';
      b.addEventListener('click', () => { el.menu.hidden = true; loadLevel(i); });
      el.levelGrid.appendChild(b);
    });
  }
  $('levelBtn').addEventListener('click', () => { el.menu.hidden = false; });
  $('menuClose').addEventListener('click', () => { el.menu.hidden = true; });
  el.menu.addEventListener('click', (e) => { if (e.target === el.menu) el.menu.hidden = true; });

  addEventListener('keydown', (e) => {
    if (menuOpen()) { if (e.code === 'Escape') el.menu.hidden = true; return; }
    const k = KEYMAP[e.code];
    if (k) { if (!e.repeat) press(k); e.preventDefault(); return; }
    if (e.code === 'KeyZ' || e.code === 'Backspace') { undo(); e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'KeyR') restartLevel();
    else if (e.code === 'KeyM') setMuted(!muted);
    else if (e.code === 'Enter' || e.code === 'Space') {
      if (game.mode === 'end') { clearProgress(); newGame(); }
      else if (game.mode === 'result') nextLevel();
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) release(k);
  });
  addEventListener('blur', () => { held.length = 0; queued = null; touch = null; });

  // ---- Rules: one step at a time -----------------------------------------------------------------
  const crateCanEnter = (gx, gy) => {
    const ch = tileAt(gx, gy);
    // floor, gold, open water or fire (the crate burns up): never bricks, the door, or a bridge
    return (ch === '.' || ch === 'g' || ch === '~' || ch === 'F') && !crateAt(gx, gy);
  };

  // Returns true if the step started.
  function startStep(name, carry) {
    const d = DIRS[name];
    const nx = player.gx + d.x, ny = player.gy + d.y;
    const ch = tileAt(nx, ny);
    if (ch === '#' || ch === '~') return false;

    const crate = crateAt(nx, ny);
    if (crate) {
      const tx = nx + d.x, ty = ny + d.y;
      if (!crateCanEnter(tx, ty)) return false;
      crate.toX = tx; crate.toY = ty;
      sfx.push();
    }
    game.undo.push(snapshot());
    if (game.undo.length > UNDO_LIMIT) game.undo.shift();
    game.moves++;
    updateHud();
    player.fromX = player.gx; player.fromY = player.gy;
    player.gx = nx; player.gy = ny;
    player.pushed = crate || null;
    player.moving = true;
    player.t = carry / MOVE_TIME;
    player.steps++;
    return true;
  }

  function finishStep() {
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
    if (ch === 'F') { die(); return; }
    if (ch === 'g') {
      game.grid[player.gy][player.gx] = '.';
      game.gold++;
      sfx.gold();
      updateHud();
    } else if (ch === 'D') {
      game.mode = 'exiting';                 // walk into the door, then show the result
      game.modeTime = 0;
      held.length = 0; queued = null;
      sfx.win();
    }
  }

  function completeLevel() {
    const def = LEVELS[game.level];
    const got = game.levelGoldTotal - goldLeft();
    const allGold = got === game.levelGoldTotal;
    const limit = Math.ceil(def.par * THREE_STAR_SLACK);
    const n = allGold ? (game.moves <= limit ? 3 : 2) : 1;
    const prev = best[game.level];
    if (!prev || n > prev.stars || (n === prev.stars && game.moves < prev.moves)) {
      best[game.level] = { stars: n, moves: game.moves };
      saveBest();
    }
    const last = game.level + 1 >= LEVELS.length;
    if (last) clearProgress(); else writeProgress(game.level + 1, game.gold);

    game.mode = 'result';
    el.resultTitle.textContent = n === 3 ? 'Perfect!' : 'Level complete';
    el.resultStars.textContent = starText(n);
    el.resultInfo.textContent = `${game.moves} steps · par ${def.par} · gold ${got}/${game.levelGoldTotal}`;
    el.resultTip.textContent = n === 3 ? '' : !allGold ? 'Collect all the gold for ★★.'
      : `Collect all the gold in ${limit} steps or fewer for ★★★.`;
    el.resultNext.textContent = last ? 'Finish' : 'Next level';
    el.result.hidden = false;
    el.resultNext.focus({ preventScroll: true });
    renderLevelGrid();
  }

  function nextLevel() {
    el.result.hidden = true;
    if (game.level + 1 < LEVELS.length) { loadLevel(game.level + 1); return; }
    game.mode = 'end';
    game.modeTime = 0;
    el.endGold.textContent = `● ${game.gold} gold · ★ ${totalStars()}/${LEVELS.length * 3}`;
    el.end.hidden = false;
  }
  el.resultNext.addEventListener('click', nextLevel);
  el.resultRetry.addEventListener('click', () => {
    el.result.hidden = true;
    game.gold = game.goldAtLevelStart;       // replaying a level doesn't count its gold twice
    loadLevel(game.level);
  });

  function die() {
    game.mode = 'dying';
    game.modeTime = 0;
    held.length = 0; queued = null;
    sfx.fire();
    if (navigator.vibrate) navigator.vibrate(120);
  }

  function update(dt) {
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

  // ---- Rendering -------------------------------------------------------------------------------
  // The canvas is sized to the space on screen; a level is drawn as large as fits, centred.
  function fitCanvas() {
    const box = el.stage.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const px = Math.max(120, Math.floor(Math.min(box.width, box.height) * dpr));
    canvas.style.width = canvas.style.height = (px / dpr) + 'px';   // exactly 1 canvas px per device px
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  }
  new ResizeObserver(fitCanvas).observe(el.stage);
  addEventListener('resize', fitCanvas);
  addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));
  fitCanvas();

  function load(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Could not load ' + src));
      img.src = src;
    });
  }

  // Small deterministic pseudo-random number in 0..1 for a tile, so every tile animates out of step.
  const hash = (x, y, k = 0) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const scratch = document.createElement('canvas');   // used to tint burning crates
  const scratchCtx = scratch.getContext('2d');

  function draw(tilesheet, spritesheet) {
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

    for (const e of game.effects) if (e.type === 'burn') burnFx(e);

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
      ctx.save();
      ctx.translate(sx + T / 2, sy + T / 2);
      ctx.rotate(k * 10);
      ctx.scale(1 - k * 0.6, 1 - k * 0.6);
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

    if (game.mode === 'dying') {
      ctx.fillStyle = `rgba(255,60,0,${0.35 * (1 - game.modeTime / DEATH_TIME)})`;
      ctx.fillRect(0, 0, V, V);
    }
    if (game.fade > 0) {
      ctx.fillStyle = `rgba(43,43,43,${Math.min(1, game.fade / FADE_TIME)})`;
      ctx.fillRect(0, 0, V, V);
    }
  }

  // ---- Main loop (fixed-step updates, render every animation frame) --------------------------------
  Promise.all([load('assets/tilesheet.png'), load('assets/spritesheet.png')]).then(([tiles, sprites]) => {
    const saved = loadProgress();
    game.gold = saved ? saved.gold : 0;
    loadLevel(saved ? saved.level : 0);
    fitCanvas();
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
})();
