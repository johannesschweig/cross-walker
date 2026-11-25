#!/usr/bin/env node
/*
 * Checks every level in game.js: well-formed, solvable, all gold collectable on a run that ends
 * at the door, and `par` correct (par = fewest steps that collect all gold and reach the door).
 * Also prints the shortest way to the door (steps / crate pushes).
 *
 *   node tools/check-levels.js          check; exit code 1 if anything is wrong
 *   node tools/check-levels.js --write  also fix wrong `par` values in game.js
 *
 * Rules mirrored from game.js: fire is never stepped on; a crate pushed into water becomes a
 * bridge (walkable, crates can't enter it); a crate pushed into fire burns up (the fire stays).
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(file, 'utf8');
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
  const full = (1 << golds.size) - 1;
  const bit = (x, y) => (golds.has(`${x},${y}`) ? 1 << golds.get(`${x},${y}`) : 0);
  // `ch` = water cells filled with a crate (they are bridges now).
  const key = (p, cr, ch, m) =>
    `${p}|${cr.map((c) => c.join()).sort().join(';')}|${[...ch].sort().join(';')}|${m}`;

  const first = { p: start, cr: crates, ch: new Set(), m: bit(...start), push: 0, d: 0 };
  const queue = [first];
  const seen = new Set([key(first.p, first.cr, first.ch, first.m)]);
  let shortest = null, par = null, bestGold = 0;
  for (let i = 0; i < queue.length; i++) {
    const st = queue[i];
    const [px, py] = st.p;
    if (px === door[0] && py === door[1]) {
      if (!shortest) shortest = st;
      if (par === null && st.m === full) par = st.d;
      bestGold = Math.max(bestGold, st.m.toString(2).split('1').length - 1);
      continue;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;
      const t = g[ny][nx];
      if (t === '#') continue;
      if (t === 'F' || (t === '~' && !st.ch.has(`${nx},${ny}`))) continue;
      let cr = st.cr, ch = st.ch, push = 0;
      const ci = cr.findIndex((c) => c[0] === nx && c[1] === ny);
      if (ci >= 0) {
        const tx = nx + dx, ty = ny + dy;
        const u = g[ty][tx];
        if (cr.some((c) => c[0] === tx && c[1] === ty)) continue;
        if (u === '~' && !ch.has(`${tx},${ty}`)) {                     // fills the water
          ch = new Set(ch).add(`${tx},${ty}`);
          cr = cr.filter((_, j) => j !== ci);
        } else if (u === 'F') {                                         // burns up, fire stays
          cr = cr.filter((_, j) => j !== ci);
        } else if (u === '.' || u === 'g') {
          cr = cr.map((c, j) => (j === ci ? [tx, ty] : c));
        } else continue;
        push = 1;
      }
      const m = st.m | bit(nx, ny);
      const k = key([nx, ny], cr, ch, m);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ p: [nx, ny], cr, ch, m, push: st.push + push, d: st.d + 1 });
    }
  }
  return shortest && { moves: shortest.d, pushes: shortest.push, gold: golds.size, bestGold, par };
}

let failed = 0;
const pars = [];
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
    else if (r.par === null) problems.push(`only ${r.bestGold}/${r.gold} gold collectable`);
    else {
      pars[i] = r.par;
      if (lv.par !== r.par) problems.push(`par is ${lv.par}, should be ${r.par}`);
      info = `${r.moves} steps to the door, par ${r.par}, ${r.pushes} pushes, ${r.gold} gold`;
    }
  }
  const label = `${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} ${rows[0].length}x${rows.length}`;
  if (problems.length) { failed++; console.log(`FAIL ${label}  ${problems.join('; ')}`); }
  else console.log(`ok   ${label}  ${info}`);
});

if (failed && process.argv.includes('--write') && pars.every((p) => p !== undefined)) {
  let n = 0;
  const fixed = src.replace(/const LEVELS = \[[\s\S]*?\n  \];/, (block) =>
    block.replace(/par: \d+,/g, () => `par: ${pars[n++]},`));
  fs.writeFileSync(file, fixed);
  console.log(`\nWrote ${n} par values to game.js. Run again to confirm.`);
  process.exit(0);
}
process.exit(failed ? 1 : 0);
