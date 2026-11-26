#!/usr/bin/env node
/*
 * Level generator (offline). Prints ranked candidates with an ASCII preview; it never touches
 * src/levels.js. Pick the ones you like, play them, and paste them in by hand (--snippet prints the
 * object to paste, then run `npm run check -- --write` to be sure par is right).
 *
 *   node tools/generate-levels.js [--seed N] [--tries N] [--top N] [--par MIN-MAX]
 *                                 [--mechanics river,fire,crack] [--size WxH] [--climb N]
 *                                 [--min-need 0.7] [--max-states N] [--snippet]
 *
 * How it works
 *   1. Skeleton: the level is cut into zones by 1-3 "chokes" (full columns). Each choke is a gadget:
 *        river  a column of water, with a crate waiting in the zone before it (bridge)
 *        fire   a wall with one fire tile as the opening, plus a bucket and a pool of water earlier
 *        crack  a wall whose only opening is cracked floor (one-way: you can't come back)
 *        wall   a wall with 1-2 plain openings (a filler, keeps levels from being all gadgets)
 *      then bricks, stray fire, cracked patches and 2-4 gold are scattered in.
 *   2. Filter with the solver (tools/solver.js): solvable, all gold collectable, par in the band.
 *   3. Score: detour for 3 stars (par vs. shortest way to the door), a little trap risk (states you
 *      can't win from), and "every element earns its place": remove each crate / bucket / fire /
 *      water / cracked group and see whether par changes. Decoration is penalised.
 *   4. Hill-climb the best few: random one-tile edits, kept if the score doesn't drop.
 *   5. Drop mirror images of existing levels or of each other.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve } from './solver.js';

// ---- options ---------------------------------------------------------------------------------
const opt = { seed: Math.floor(Math.random() * 1e6), tries: 1500, top: 5, par: '14-40', climb: 25, pool: 10,
  mechanics: 'river,fire,crack', size: '', minNeed: 0.7, maxStates: 60000, snippet: false, help: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
  if (!(key in opt)) { console.error(`Unknown option ${argv[i]} (try --help)`); process.exit(2); }
  if (typeof opt[key] === 'boolean') opt[key] = true;
  else opt[key] = typeof opt[key] === 'number' ? Number(argv[++i]) : argv[++i];
}
if (opt.help) {
  console.log(fsHeader());
  process.exit(0);
}
function fsHeader() {
  return 'Usage: node tools/generate-levels.js [--seed N] [--tries N] [--top N] [--par MIN-MAX]\n' +
    '       [--mechanics river,fire,crack] [--size WxH] [--climb N] [--pool N] [--min-need 0.7]\n' +
    '       [--max-states N] [--snippet]\nSee the comment at the top of the file for what it does.';
}
const [parMin, parMax] = opt.par.split('-').map(Number);
const mechanics = opt.mechanics.split(',').filter(Boolean);
for (const m of mechanics) if (!['river', 'fire', 'crack'].includes(m)) { console.error(`Unknown mechanic ${m}`); process.exit(2); }
const size = opt.size ? opt.size.split('x').map(Number) : null;

// ---- seeded random numbers (same seed, same levels) -----------------------------------------
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(opt.seed);
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));   // inclusive
const pick = (arr) => (arr.length ? arr[Math.floor(rand() * arr.length)] : undefined);

// ---- 1. skeleton ----------------------------------------------------------------------------
function generate() {
  const W = size ? size[0] : int(8, 10), H = size ? size[1] : int(6, 8);
  const g = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
  const protectedCell = new Set();
  const lock = (x, y) => protectedCell.add(`${x},${y}`);

  // choke columns, at least 3 apart so every zone is 2+ columns wide
  const want = int(1, W >= 10 ? 3 : 2);
  const cols = [];
  for (let n = 0; n < 30 && cols.length < want; n++) {
    const c = int(3, W - 4);
    if (cols.every((o) => Math.abs(o - c) >= 3)) cols.push(c);
  }
  cols.sort((a, b) => a - b);
  const zones = cols.map((c, i) => [i === 0 ? 1 : cols[i - 1] + 1, c - 1]);   // zone i is left of choke i
  zones.push([cols[cols.length - 1] + 1, W - 2]);
  const types = cols.map(() => pick([...mechanics, 'wall']));
  if (!types.some((t) => t !== 'wall')) types[int(0, types.length - 1)] = pick(mechanics);

  const sy = int(1, H - 2), dy = int(1, H - 2);
  g[sy][1] = 'S'; lock(1, sy);
  g[dy][W - 2] = 'D'; lock(W - 2, dy);

  const free = (zone, filter = () => true) => {
    const out = [];
    for (let x = zones[zone][0]; x <= zones[zone][1]; x++) {
      for (let y = 1; y <= H - 2; y++) if (g[y][x] === '.' && !protectedCell.has(`${x},${y}`) && filter(x, y)) out.push([x, y]);
    }
    return out;
  };
  const put = (zone, ch, filter) => {
    const cell = pick(free(zone, filter));
    if (!cell) return false;
    g[cell[1]][cell[0]] = ch;
    lock(cell[0], cell[1]);
    return true;
  };

  cols.forEach((c, i) => {
    const type = types[i];
    for (let y = 1; y <= H - 2; y++) g[y][c] = type === 'river' ? '~' : '#';
    for (let y = 1; y <= H - 2; y++) lock(c, y);
    if (type === 'river') {
      // a crate that can be pushed straight into the water: not in the first column of its zone
      // (nobody could stand behind it) and not against the top/bottom wall
      const z = rand() < 0.3 ? int(0, i) : i;
      put(z, 'c', (x, y) => x > zones[z][0] && y >= 2 && y <= H - 3);
    } else if (type === 'fire') {
      g[int(1, H - 2)][c] = 'F';
      put(int(0, i), 'b');
      put(int(0, i), '~');                       // a pool of water to fill the bucket from
    } else if (type === 'crack') {
      g[int(1, H - 2)][c] = 'x';
    } else {
      g[int(1, H - 2)][c] = '.';
      if (rand() < 0.4) g[int(1, H - 2)][c] = '.';
    }
  });
  // a stray extra crate now and then (sometimes a decoy, sometimes a second bridge)
  if (rand() < 0.35) put(int(0, zones.length - 1), 'c', (x, y) => y >= 2 && y <= H - 3);

  // cracked patch inside a zone: a run you can cross only once
  if (mechanics.includes('crack') && rand() < 0.4) {
    const z = int(0, zones.length - 1), len = int(2, 3), y = int(1, H - 2);
    const x0 = int(zones[z][0], Math.max(zones[z][0], zones[z][1] - len + 1));
    for (let x = x0; x < x0 + len && x <= zones[z][1]; x++) if (g[y][x] === '.' && !protectedCell.has(`${x},${y}`)) g[y][x] = 'x';
  }

  // bricks, stray fire, gold
  const density = 0.08 + rand() * 0.1;
  for (let y = 1; y <= H - 2; y++) {
    for (let x = 1; x <= W - 2; x++) if (g[y][x] === '.' && !protectedCell.has(`${x},${y}`) && rand() < density) g[y][x] = '#';
  }
  for (let n = int(0, 3); n > 0; n--) put(int(0, zones.length - 1), 'F');
  put(int(Math.min(1, zones.length - 1), zones.length - 1), 'g');      // one gold behind the first gadget
  for (let n = int(1, 3); n > 0; n--) put(int(0, zones.length - 1), 'g');
  return g.map((r) => r.join(''));
}

// ---- 2./3. evaluation -----------------------------------------------------------------------
// Connected groups of crate / bucket / fire / water / cracked tiles: each is one "element".
function elements(rows) {
  const H = rows.length, W = rows[0].length, seen = new Set(), out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (!'cbF~x'.includes(ch) || seen.has(`${x},${y}`)) continue;
      const cells = [], todo = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length) {
        const [cx, cy] = todo.pop();
        cells.push([cx, cy]);
        if (ch === 'c' || ch === 'b') continue;
        for (const [ax, ay] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (rows[ay]?.[ax] === ch && !seen.has(`${ax},${ay}`)) { seen.add(`${ax},${ay}`); todo.push([ax, ay]); }
        }
      }
      out.push({ ch, cells });
    }
  }
  return out;
}

function evaluate(rows, withNeed) {
  const r = solve(rows, { maxStates: opt.maxStates, traps: true });
  if (!r || r.truncated || r.par === null || r.par < parMin || r.par > parMax) return null;
  const m = { ...r, gap: r.par - r.moves, needed: 0, total: 0 };
  m.score = 2 * Math.min(m.gap, 8) / 8 + 1.5 * Math.max(0, 1 - Math.abs(m.trap - 0.15) / 0.15);
  if (withNeed) {
    const els = elements(rows);
    for (const el of els) {
      const g = rows.map((row) => row.split(''));
      for (const [x, y] of el.cells) g[y][x] = '.';
      const without = solve(g.map((row) => row.join('')), { maxStates: opt.maxStates });
      if (!without || without.truncated || without.par !== r.par) m.needed++;   // removing it changes the level
    }
    m.total = els.length;
    if (!m.total || m.needed / m.total < opt.minNeed) return null;
    m.score += 4 * m.needed / m.total;
    // variety: reward levels that mix mechanics (crate, bucket, fire, cracked floor) over plain rivers
    m.score += 0.7 * new Set(els.map((el) => el.ch).filter((ch) => 'cbFx'.includes(ch))).size;
  }
  return m;
}

// ---- 4. hill climbing -----------------------------------------------------------------------
function mutate(rows) {
  const g = rows.map((r) => r.split(''));
  const H = g.length, W = g[0].length;
  const cells = (ok) => {
    const out = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (ok(g[y][x])) out.push([x, y]);
    return out;
  };
  const op = int(0, 4);
  if (op === 0 || op === 4) {                    // wall <-> floor, or fire <-> floor
    const [a, b] = op === 0 ? ['.', '#'] : ['.', 'F'];
    const c = pick(cells((t) => t === a || t === b));
    if (!c) return null;
    g[c[1]][c[0]] = g[c[1]][c[0]] === a ? b : a;
  } else {                                       // move a gold, crate or bucket
    const ch = 'gcb'[op - 1];
    const from = pick(cells((t) => t === ch)), to = pick(cells((t) => t === '.'));
    if (!from || !to) return null;
    g[from[1]][from[0]] = '.';
    g[to[1]][to[0]] = ch;
  }
  return g.map((r) => r.join(''));
}

function climb(rows, m) {
  for (let i = 0; i < opt.climb; i++) {
    const next = mutate(rows);
    if (!next) continue;
    const nm = evaluate(next, true);
    if (nm && nm.score >= m.score) { rows = next; m = nm; }
  }
  return { rows, m };
}

// ---- 5. dedupe ------------------------------------------------------------------------------
function canon(rows) {
  const flipH = (r) => r.map((row) => [...row].reverse().join(''));
  const flipV = (r) => [...r].reverse();
  return [rows, flipH(rows), flipV(rows), flipV(flipH(rows))].map((r) => r.join('\n')).sort()[0];
}

// ---- run ------------------------------------------------------------------------------------
const levelsFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'levels.js');
const { LEVELS } = await import(pathToFileURL(levelsFile).href);
const known = new Set(LEVELS.map((l) => canon(l.rows)));

const t0 = Date.now();
let valid = 0, kept = [];
for (let i = 0; i < opt.tries; i++) {
  const rows = generate();
  if (!evaluate(rows, false)) continue;           // cheap filter first
  valid++;
  const m = evaluate(rows, true);
  if (m) kept.push({ rows, m });
}
kept.sort((a, b) => b.m.score - a.m.score);
const seedCount = kept.length;
kept = kept.slice(0, opt.pool).map(({ rows, m }) => (opt.climb ? climb(rows, m) : { rows, m }));
kept.sort((a, b) => b.m.score - a.m.score);

const out = [];
for (const c of kept) {
  const k = canon(c.rows);
  if (known.has(k)) continue;
  known.add(k);
  out.push(c);
  if (out.length >= opt.top) break;
}

console.log(`seed ${opt.seed}: ${opt.tries} generated, ${valid} solvable in par ${parMin}-${parMax}, ` +
  `${seedCount} with every element needed, ${out.length} shown (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
out.forEach(({ rows, m }, i) => {
  console.log(`#${i + 1}  score ${m.score.toFixed(1)}  ${rows[0].length}x${rows.length}  par ${m.par}  ` +
    `door in ${m.moves}  pushes ${m.pushes}  gold ${m.gold}  traps ${Math.round(m.trap * 100)}%  ` +
    `elements needed ${m.needed}/${m.total}  states ${m.states}`);
  console.log(rows.map((r) => `   ${r}`).join('\n'));
  if (opt.snippet) {
    console.log(`\n  {\n    name: "Gen ${opt.seed}-${i + 1}",\n    hint: "",\n    par: ${m.par},\n    rows: [\n` +
      rows.map((r) => `      "${r}",`).join('\n') + '\n    ],\n  },');
  }
  console.log('');
});
if (!out.length) console.log('Nothing passed the filters. Try more --tries, a wider --par band or a lower --min-need.');
