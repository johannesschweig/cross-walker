#!/usr/bin/env node
/*
 * Checks every level in game.js: well-formed, solvable, and all gold collectable on a run that
 * ends at the door. Prints the shortest solution length (moves / crate pushes) per level.
 *
 *   node tools/check-levels.js
 *
 * Exits with 1 if any level fails. Run it after touching LEVELS.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const match = src.match(/const LEVELS = (\[[\s\S]*?\n  \]);/);
if (!match) { console.error('Could not find LEVELS in game.js'); process.exit(1); }
const LEVELS = new Function(`return ${match[1]};`)();

function solve(rows) {
  const H = rows.length, W = rows[0].length;
  const g = rows.map((r) => r.split(''));
  let start, door;
  const crates = [];
  const golds = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y][x];
      if (c === 'S') { start = [x, y]; g[y][x] = '.'; }
      else if (c === 'D') door = [x, y];
      else if (c === 'c') { crates.push([x, y]); g[y][x] = '.'; }
      else if (c === 'g') golds.set(`${x},${y}`, golds.size);
    }
  }
  const bit = (x, y) => (golds.has(`${x},${y}`) ? 1 << golds.get(`${x},${y}`) : 0);
  const key = (p, cr, fl, m) =>
    `${p}|${cr.map((c) => c.join()).sort().join(';')}|${[...fl].sort().join(';')}|${m}`;

  const first = { p: start, cr: crates, fl: new Set(), m: bit(...start), prev: null, push: 0, d: 0 };
  const queue = [first];
  const seen = new Set([key(first.p, first.cr, first.fl, first.m)]);
  let best = null, bestGold = -1;
  for (let i = 0; i < queue.length; i++) {
    const st = queue[i];
    const [px, py] = st.p;
    if (px === door[0] && py === door[1]) {
      if (!best) best = st;
      bestGold = Math.max(bestGold, st.m.toString(2).split('1').length - 1);
      continue;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;
      const ch = g[ny][nx];
      if (ch === '#' || ch === 'F') continue;
      if (ch === '~' && !st.fl.has(`${nx},${ny}`)) continue;
      let cr = st.cr, fl = st.fl, push = 0;
      const ci = cr.findIndex((c) => c[0] === nx && c[1] === ny);
      if (ci >= 0) {
        const tx = nx + dx, ty = ny + dy;
        const t = g[ty][tx];
        if (cr.some((c) => c[0] === tx && c[1] === ty)) continue;
        if (t === '~' && !fl.has(`${tx},${ty}`)) {
          fl = new Set(fl).add(`${tx},${ty}`);
          cr = cr.filter((_, j) => j !== ci);
        } else if ((t === '.' || t === 'g') && !fl.has(`${tx},${ty}`)) {
          cr = cr.map((c, j) => (j === ci ? [tx, ty] : c));
        } else continue;
        push = 1;
      }
      const m = st.m | bit(nx, ny);
      const k = key([nx, ny], cr, fl, m);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ p: [nx, ny], cr, fl, m, prev: st, push: st.push + push, d: st.d + 1 });
    }
  }
  return best && { moves: best.d, pushes: best.push, gold: golds.size, bestGold };
}

let failed = 0;
LEVELS.forEach((lv, i) => {
  const rows = lv.rows;
  const problems = [];
  if (!rows.every((r) => r.length === rows[0].length)) problems.push('rows have different lengths');
  if (rows.join('').split('S').length !== 2) problems.push('needs exactly one S');
  if (rows.join('').split('D').length !== 2) problems.push('needs exactly one D');
  if (!rows[0].split('').every((c) => c === '#') || !rows[rows.length - 1].split('').every((c) => c === '#') ||
      !rows.every((r) => r[0] === '#' && r[r.length - 1] === '#')) problems.push('border must be bricks');
  let info = '';
  if (!problems.length) {
    const r = solve(rows);
    if (!r) problems.push('UNSOLVABLE');
    else if (r.bestGold < r.gold) problems.push(`only ${r.bestGold}/${r.gold} gold collectable`);
    else info = `${r.moves} moves, ${r.pushes} pushes, ${r.gold} gold`;
  }
  const label = `${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} ${rows[0].length}x${rows.length}`;
  if (problems.length) { failed++; console.log(`FAIL ${label}  ${problems.join('; ')}`); }
  else console.log(`ok   ${label}  ${info}`);
});
process.exit(failed ? 1 : 0);
