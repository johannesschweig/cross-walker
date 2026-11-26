#!/usr/bin/env node
/*
 * Level generator (offline). Prints ranked candidates with an ASCII preview; it never touches
 * src/levels.js. Pick the ones you like, play them, and paste them in by hand (--snippet prints the
 * object to paste, then run `npm run check -- --write` to be sure par is right).
 *
 *   node tools/generate-levels.js [--seed N] [--tries N] [--top N] [--par MIN-MAX]
 *                                 [--mechanics river,fire,crack,dig] [--mix 2] [--size WxH] [--climb N]
 *                                 [--min-need 0.7] [--max-states N] [--snippet]
 *
 * How it works
 *   1. Skeleton: each level uses only `--mix` families of mechanics (default 2 of water, fire,
 *      crack, dig). The level is cut into zones by "chokes" (full columns), one gadget per family:
 *        river  a column of water, with a crate waiting before it (bridge); pond = a one-tile river
 *        fire   a wall with one fire tile as the opening, plus a bucket and a pool of water earlier
 *        crack  a wall whose only opening is cracked floor (one-way: you can't come back)
 *        dig    a wall whose only opening is a cracked wall (W), plus a pickaxe earlier; the
 *               pickaxe breaks after one wall; one tool at a time, a different tool is swapped in
 *      The gadgets are tied together (fire in a crate's lane, cracked floor next to a crate, a
 *      bucket that has to be refilled between fires), then bricks, stray fire and guarded gold are
 *      added. Half the levels are turned 90 degrees.
 *   2. Filter with the solver (tools/solver.js): solvable, all gold collectable, par in the band.
 *   3. Score: detour for 3 stars (par vs. shortest way to the door), a little trap risk (states you
 *      can't win from), crate pushes on the par route, fewer shortest solutions (tight puzzle, not
 *      an open room), and "every element earns its place": remove each crate / bucket / fire /
 *      water / cracked group and see whether par changes. Decoration is penalised.
 *   4. Hill-climb the best few: random one-tile edits, kept if the score doesn't drop.
 *   5. Pick the final list greedily: drop mirror images of existing levels, and mark down levels with
 *      the same mechanics, fire count and crate count as ones already in the game or already shown.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve } from './solver.js';

// ---- options ---------------------------------------------------------------------------------
const opt = { seed: Math.floor(Math.random() * 1e6), tries: 1500, top: 5, par: '14-40', climb: 25, pool: 24,
  mechanics: 'river,fire,crack,dig', mix: 2, size: '', minNeed: 0.7, maxStates: 60000, snippet: false, help: false };
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
    '       [--mechanics river,fire,crack,dig] [--mix 2] [--size WxH] [--climb N] [--pool N] [--min-need 0.7]\n' +
    '       [--max-states N] [--snippet]\nSee the comment at the top of the file for what it does.';
}
const [parMin, parMax] = opt.par.split('-').map(Number);
const mechanics = opt.mechanics.split(',').filter(Boolean);
for (const m of mechanics) if (!['river', 'fire', 'crack', 'dig'].includes(m)) { console.error(`Unknown mechanic ${m}`); process.exit(2); }
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
// Each level uses only `mix` mechanic families (default 2) and ties them together instead of
// scattering everything: families are water (crates + rivers/ponds), fire (bucket + pool + fire)
// and crack (cracked floor). Interactions the gadgets are built to produce:
//   pond + fire   a one-tile river gate plus a fire gate: bucket and pool are separate, so a crate can
//                 never use up the only water
//   crack + fire  the cracked gate is one-way, so the bucket must be full before you cross
//   fire in lane  a fire between crate and river forces the crate around it, or the fire out first
//   crack patch   cracked floor next to a crate, which can't be pushed onto it
function generate() {
  const fams = [...['water', 'fire', 'crack', 'dig'].filter((f) => mechanics.includes({ water: 'river', fire: 'fire', crack: 'crack', dig: 'dig' }[f]))]
    .sort(() => rand() - 0.5).slice(0, opt.mix);
  const W = size ? size[0] : fams.length >= 3 ? 11 : int(8, 10), H = size ? size[1] : int(6, 8);
  const g = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
  const protectedCell = new Set();
  const lock = (x, y) => protectedCell.add(`${x},${y}`);

  // choke columns: first and last zone 2+ wide, chokes 2+ apart (a corridor column between them)
  const want = Math.max(2, fams.length);
  const cols = [];
  for (let n = 0; n < 60 && cols.length < want; n++) {
    const c = int(3, W - 4);
    if (cols.every((o) => Math.abs(o - c) >= 2)) cols.push(c);
  }
  if (cols.length < want) return null;
  cols.sort((a, b) => a - b);
  const zones = cols.map((c, i) => [i === 0 ? 1 : cols[i - 1] + 1, c - 1]);   // zone i is left of choke i
  zones.push([cols[cols.length - 1] + 1, W - 2]);

  // one choke per family first (so every family shows up), then random extras; random order
  const kind = { water: () => pick(['river', 'pond']), fire: () => 'fire', crack: () => 'crack', dig: () => 'dig' };
  const types = fams.map((f) => kind[f]());
  while (types.length < cols.length) types.push(kind[pick(fams)]());
  types.sort(() => rand() - 0.5);

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
    if (!cell) return null;
    g[cell[1]][cell[0]] = ch;
    lock(cell[0], cell[1]);
    return cell;
  };

  const crates = [];                 // { x, y, choke } for lane fire
  cols.forEach((c, i) => {
    const type = types[i];
    for (let y = 1; y <= H - 2; y++) { g[y][c] = type === 'river' ? '~' : '#'; lock(c, y); }
    const row = int(1, H - 2);
    if (type === 'river' || type === 'pond') {
      if (type === 'pond') g[row][c] = '~';
      // a crate that can be pushed straight into the water: not in the first column of its zone
      // (nobody could stand behind it) and not against the top/bottom wall
      const z = rand() < 0.3 ? int(0, i) : i;
      const cell = put(z, 'c', (x, y) => x > zones[z][0] && y >= 2 && y <= H - 3);
      if (cell) crates.push({ x: cell[0], y: cell[1], choke: c });
    } else if (type === 'fire') {
      g[row][c] = 'F';
      // The bucket is usually within reach from the start (a chain where every step unlocks the
      // next is boring). The pool is always separate from any pond: a crate must never be able to
      // use up the only water (playtest: "you can't get water from a crated water" was frustrating).
      put(rand() < 0.7 ? 0 : int(0, i), 'b');
      put(int(0, i), '~');
    } else if (type === 'crack') {
      g[row][c] = 'x';
    } else if (type === 'dig') {
      g[row][c] = 'W';
      put(int(0, i), 'p');                     // the pickaxe is before its wall
    }
  });
  if (rand() < 0.2) put(int(0, zones.length - 1), 'c', (x, y) => y >= 2 && y <= H - 3);   // spare crate

  // a fire between a crate and its river
  if (crates.length && rand() < (fams.includes('fire') ? 0.5 : 0.3)) {
    const k = pick(crates);
    const xs = [];
    for (let x = k.x + 1; x < k.choke; x++) if (g[k.y][x] === '.' && !protectedCell.has(`${x},${k.y}`)) xs.push(x);
    if (xs.length) g[k.y][pick(xs)] = 'F';
  }
  // cracked patch inside a zone, half the time in the crate's zone
  if (fams.includes('crack') && rand() < 0.5) {
    const z = crates.length && rand() < 0.5 ? zones.findIndex(([a, b]) => crates[0].x >= a && crates[0].x <= b) : int(0, zones.length - 1);
    const zz = z < 0 ? 0 : z, len = int(2, 3), y = int(1, H - 2);
    const x0 = int(zones[zz][0], Math.max(zones[zz][0], zones[zz][1] - len + 1));
    for (let x = x0; x < x0 + len && x <= zones[zz][1]; x++) if (g[y][x] === '.' && !protectedCell.has(`${x},${y}`)) g[y][x] = 'x';
  }

  // tight levels beat open rooms: plenty of bricks
  const density = 0.12 + rand() * 0.16;
  for (let y = 1; y <= H - 2; y++) {
    for (let x = 1; x <= W - 2; x++) if (g[y][x] === '.' && !protectedCell.has(`${x},${y}`) && rand() < density) g[y][x] = '#';
  }
  // several fires in a fire level: one bucket empties after one fire, so the player has to plan trips to the pool
  for (let n = fams.includes('fire') ? int(1, 3) : int(0, 1); n > 0; n--) put(int(0, zones.length - 1), 'F');

  // gold: one behind the first gadget, the rest anywhere, half of them guarded (next to a hazard)
  const guarded = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => 'F~xc'.includes(g[y + dy]?.[x + dx] ?? ' '));
  const gold = (zone) => (rand() < 0.5 && put(zone, 'g', guarded)) || put(zone, 'g');
  gold(int(1, zones.length - 1));
  for (let n = int(1, 3); n > 0; n--) gold(int(0, zones.length - 1));

  const rows = g.map((r) => r.join(''));
  if (size || rand() < 0.5) return rows;
  // turn it 90 degrees half the time, so rivers and gates run across as well as down
  return rows[0].split('').map((_, x) => rows.map((r) => r[x]).join(''));
}

// ---- 2./3. evaluation -----------------------------------------------------------------------
// Connected groups of crate / bucket / fire / water / cracked tiles: each is one "element".
function elements(rows) {
  const H = rows.length, W = rows[0].length, seen = new Set(), out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (!'cbpFW~x'.includes(ch) || seen.has(`${x},${y}`)) continue;
      const cells = [], todo = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length) {
        const [cx, cy] = todo.pop();
        cells.push([cx, cy]);
        if (ch === 'c' || ch === 'b' || ch === 'p') continue;
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
  // traps: the hand-made levels 4-14 have 55-90% of their states unwinnable (one wrong push and it's
  // over), early ones 0%. Reward up to 70%.
  m.score = 2 * Math.min(m.gap, 8) / 8 + 1.5 * Math.min(m.trap, 0.7) / 0.7;
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
  }
  // Puzzles have few ways to win, open rooms have thousands: penalise a high number of shortest solutions
  m.score -= 0.8 * Math.log10(Math.max(1, m.optimal));
  // crates that really have to be pushed (on the par route), up to 6 pushes
  m.score += Math.min(m.parPushes || 0, 6) / 6;
  // Playtest: the best levels make you plan a second trip to the water (2+ fires to put out with one
  // bucket) or cross cracked floor on the par route; one-fire chains (crate, bridge, bucket, fire) were boring.
  m.score += 1.0 * Math.min(m.parDouse, 2) / 2 + 0.7 * Math.min(m.parCrack, 2) / 2;
  if (m.parDouse === 1 && !m.parCrack) m.score -= 0.5;
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
  const op = int(0, 5);
  if (op === 0 || op === 4) {                    // wall <-> floor, or fire <-> floor
    const [a, b] = op === 0 ? ['.', '#'] : ['.', 'F'];
    const c = pick(cells((t) => t === a || t === b));
    if (!c) return null;
    g[c[1]][c[0]] = g[c[1]][c[0]] === a ? b : a;
  } else {                                       // move a gold, crate or bucket
    const ch = 'gcbp'[op === 5 ? 3 : op - 1];   // 1 gold, 2 crate, 3 bucket, 5 pickaxe
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
  if (!rows || !evaluate(rows, false)) continue;  // cheap filter first
  valid++;
  const m = evaluate(rows, true);
  if (m) kept.push({ rows, m });
}
kept.sort((a, b) => b.m.score - a.m.score);
const seedCount = kept.length;
kept = kept.slice(0, opt.pool).map(({ rows, m }) => (opt.climb ? climb(rows, m) : { rows, m }));
kept.sort((a, b) => b.m.score - a.m.score);

// Pick greedily by score, but punish a level that looks like one already shown or already in the
// game (playtest: "good but the same as the others"). "Looks like" = same mechanics, same number of
// fires and crates; the check is crude on purpose.
function signature(rows) {
  const t = rows.join('');
  const n = (c) => t.split(c).length - 1;
  return `${[...'cbpFWx'].filter((k) => n(k)).join('')}${n('~') ? '~' : ''} F${Math.min(n('F'), 3)} c${Math.min(n('c'), 2)}`;
}
const seenSig = new Map();
for (const l of LEVELS) seenSig.set(signature(l.rows), (seenSig.get(signature(l.rows)) || 0) + 1);
const out = [];
while (out.length < opt.top) {
  let best = null, bestValue = -Infinity;
  for (const c of kept) {
    if (known.has(canon(c.rows))) continue;
    const value = c.m.score - 0.35 * (seenSig.get(signature(c.rows)) || 0);
    if (value > bestValue) { best = c; bestValue = value; }
  }
  if (!best) break;
  known.add(canon(best.rows));
  seenSig.set(signature(best.rows), (seenSig.get(signature(best.rows)) || 0) + 2);   // shown ones count double
  best.sig = signature(best.rows);
  out.push(best);
}

console.log(`seed ${opt.seed}: ${opt.tries} generated, ${valid} solvable in par ${parMin}-${parMax}, ` +
  `${seedCount} with every element needed, ${out.length} shown (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
out.forEach(({ rows, m, sig }, i) => {
  console.log(`#${i + 1}  score ${m.score.toFixed(1)}  [${sig}]  ${rows[0].length}x${rows.length}  par ${m.par}  ` +
    `door in ${m.moves}  pushes ${m.pushes}  gold ${m.gold}  traps ${Math.round(m.trap * 100)}%  ` +
    `elements needed ${m.needed}/${m.total}  par routes ${m.optimal}  par pushes ${m.parPushes}`);
  console.log(rows.map((r) => `   ${r}`).join('\n'));
  if (opt.snippet) {
    console.log(`\n  {\n    name: "Gen ${opt.seed}-${i + 1}",\n    hint: "",\n    par: ${m.par},\n    rows: [\n` +
      rows.map((r) => `      "${r}",`).join('\n') + '\n    ],\n  },');
  }
  console.log('');
});
if (!out.length) console.log('Nothing passed the filters. Try more --tries, a wider --par band or a lower --min-need.');
