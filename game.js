/*
 * Cross Walker – a tiny tile puzzle game, ported from a Godot 4.3 prototype
 * (the original sources live on the `main` branch).
 *
 * Rules
 *   - You move exactly one tile per step (hold a key / keep your finger down to keep walking).
 *   - Walk onto the door to finish a level and move on to the next one.
 *   - Gold is collected by stepping on it. Gold carries over between levels.
 *   - Fire kills you: you lose ALL gold and the level restarts.
 *   - Water can't be crossed. Push a crate into it and the crate stays there as a floating
 *     bridge you can walk over. Crates can't be pushed onto a bridge, and can't be pulled.
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

  // ---- Levels -------------------------------------------------------------------------------
  // #  brick (solid)     .  floor            S  start
  // ~  water (solid)     g  gold             D  door (level goal)
  // F  fire (deadly)     c  crate (pushable)
  // Internally a filled water tile becomes 'w' (water with a floating crate; walkable).
  // Every level was checked with a solver to make sure it can be finished (and that all its
  // gold can be collected on the way to the door).
  const LEVELS = [
  {
    name: 'First Steps',
    hint: "Collect the gold and reach the door.",
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
    name: 'Warm Hands',
    hint: "Fire burns. Touch it and you lose all your gold.",
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
    name: 'Splash',
    hint: "Push a crate into water to make a bridge.",
    rows: [
      "#########",
      "#S...~.D#",
      "#.c..~..#",
      "#....~.g#",
      "#########",
    ],
  },
  {
    name: 'Corner Pocket',
    hint: "Crates only go straight. Plan your turns.",
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
    name: 'Go Around',
    hint: "Fire blocks the lane. Find another way.",
    rows: [
      "#########",
      "#S....~g#",
      "#.....~.#",
      "#.cc.F~.#",
      "#.....~.#",
      "#g....~D#",
      "#########",
    ],
  },
  {
    name: 'Two Gates',
    hint: "Only one gate leads to the door. The other hides gold.",
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
    name: 'Moat',
    hint: "The door is an island. Where to build the bridge?",
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
    name: 'Two Rivers',
    hint: "Each river needs its own crate.",
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
    name: 'Fire Garden',
    hint: "Think before you push.",
    rows: [
      "#########",
      "#S..g...#",
      "#.c...g.#",
      "#..cF...#",
      "#.g..F..#",
      "#F.F....#",
      "####~####",
      "#...D.c.#",
      "#########",
    ],
  },
  {
    name: 'Island Hop',
    hint: "Fire guards the shore.",
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
    name: 'Long River',
    hint: "Take your time. Think a few pushes ahead.",
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
    name: 'Grand Tour',
    hint: "A river, then an island. Two crates, two crossings.",
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
    mode: 'play',      // 'play' | 'dying' | 'end'
    modeTime: 0,
    fade: 0,
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
  function saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ level: game.level, gold: game.goldAtLevelStart }));
    } catch (_) { /* storage unavailable */ }
  }
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

  // ---- HUD ---------------------------------------------------------------------------------------
  function updateHud() {
    const def = LEVELS[game.level];
    el.level.textContent = `Level ${game.level + 1}/${LEVELS.length}`;
    el.title.textContent = def.name;
    const got = game.levelGoldTotal - goldLeft();
    el.gold.innerHTML = `★ ${game.gold}` +
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
      b.textContent = String(i + 1);
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
    // floor, gold or open water only: never bricks, fire, the door, or an existing bridge
    return (ch === '.' || ch === 'g' || ch === '~') && !crateAt(gx, gy);
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
      sfx.win();
      if (game.level + 1 < LEVELS.length) {
        loadLevel(game.level + 1);
      } else {
        game.mode = 'end';
        game.modeTime = 0;
        held.length = 0; queued = null;
        clearProgress();
        el.endGold.textContent = `★ ${game.gold} gold`;
        el.end.hidden = false;
      }
    }
  }

  function die() {
    game.mode = 'dying';
    game.modeTime = 0;
    held.length = 0; queued = null;
    sfx.fire();
    if (navigator.vibrate) navigator.vibrate(120);
  }

  function update(dt) {
    if (game.fade > 0) game.fade -= dt;

    if (game.mode === 'dying') {
      game.modeTime += dt;
      if (game.modeTime >= DEATH_TIME) {
        game.gold = 0;                                    // fire takes all your gold
        loadLevel(game.level);
      }
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

    const cell = (name, gx, gy) => {
      const [c, r] = SPR[name];
      ctx.drawImage(tilesheet, c * SRC, r * SRC, SRC, SRC, px(gx), py(gy), T, T);
    };

    for (let ty = 0; ty < game.h; ty++) {
      for (let tx = 0; tx < game.w; tx++) {
        const ch = game.grid[ty][tx];
        if (ch === '#') cell('brick', tx, ty);
        else if (ch === '~') cell('water', tx, ty);
        else if (ch === 'w') {                    // crate floating on water
          cell('water', tx, ty);
          ctx.fillStyle = '#e3c9a0';              // plank colour, so the crate reads clearly on blue
          const pad = Math.round(T * 0.125);
          ctx.fillRect(px(tx) + pad, py(ty) + pad, T - 2 * pad, T - 2 * pad);
          cell('crate', tx, ty);
        } else {
          cell('floor', tx, ty);
          if (ch === 'g') cell('gold', tx, ty);
          else if (ch === 'D') cell('door', tx, ty);
          else if (ch === 'F') cell('fire', tx, ty);
        }
      }
    }

    const t = player.moving ? Math.min(1, player.t) : 1;
    for (const c of game.crates) {
      const k = c === player.pushed ? t : 0;
      cell('crate', c.gx + (c.toX - c.gx) * k, c.gy + (c.toY - c.gy) * k);
    }

    // Player
    const sx = px(player.fromX + (player.gx - player.fromX) * t);
    const sy = py(player.fromY + (player.gy - player.fromY) * t);
    const frame = player.moving ? 1 + (player.steps % (FRAMES - 1)) : 0;
    ctx.save();
    if (game.mode === 'dying') {
      const k = game.modeTime / DEATH_TIME;
      ctx.translate(sx + T / 2, sy + T / 2);
      ctx.rotate(k * 10);
      ctx.scale(1 - k * 0.6, 1 - k * 0.6);
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(spritesheet, 0, 0, SRC, SRC, -T / 2, -T / 2, T, T);
    } else if (game.mode !== 'end') {
      ctx.drawImage(spritesheet, frame * SRC, 0, SRC, SRC, sx, sy, T, T);
    }
    ctx.restore();

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
