#!/usr/bin/env node
/*
 * Checks every level in src/levels.js: well-formed, solvable, all gold collectable on a run that ends
 * at the door, and `par` correct (par = fewest steps that collect all gold and reach the door).
 * Also prints the shortest way to the door (steps / crate pushes).
 *
 *   node tools/check-levels.js          check; exit code 1 if anything is wrong
 *   node tools/check-levels.js --write  also fix wrong `par` values in src/levels.js
 *
 * Rules mirrored from src/rules.js: fire is never stepped on; a crate pushed into water becomes a
 * bridge (walkable, crates can't enter it); a crate pushed into fire burns up (the fire stays);
 * cracked floor (x) can be stepped on once: when you step off it, it breaks (X) and stepping on it
 * again kills you, just like fire. Crates can't be pushed onto cracked floor.
 * Bucket (b): picked up by walking onto it (one at a time). Moving into open water with an empty
 * bucket fills it, moving into fire with a full one puts the fire out; either takes a step and the
 * player stays put. Crates can't be pushed onto an unpicked bucket tile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'levels.js');
const { LEVELS } = await import(pathToFileURL(file).href);

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
  // State of a search node:
  //   `ch` = water cells filled with a crate (they are bridges now)
  //   `bk` = cracked floor cells that have been stepped on and left (they are broken now)
  //   `bucket` = 0 none, 1 empty, 2 full; `ex` = fires put out; `pk` = bucket tiles picked up
  const keyOf = (s) =>
    `${s.p}|${s.cr.map((c) => c.join()).sort().join(';')}|${[...s.ch].sort().join(';')}|${[...s.bk].sort().join(';')}` +
    `|${s.bucket}|${[...s.ex].sort().join(';')}|${[...s.pk].sort().join(';')}|${s.m}`;

  const first = { p: start, cr: crates, ch: new Set(), bk: new Set(), bucket: 0, ex: new Set(), pk: new Set(),
    m: bit(...start), push: 0, d: 0 };
  const queue = [first];
  const seen = new Set([keyOf(first)]);
  const add = (st) => {
    const k = keyOf(st);
    if (seen.has(k)) return;
    seen.add(k);
    queue.push(st);
  };
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
      const nx = px + dx, ny = py + dy, at = `${nx},${ny}`;
      let t = g[ny][nx];
      if ((t === 'F' && st.ex.has(at)) || (t === 'b' && st.pk.has(at))) t = '.';   // put out / picked up
      if (t === '#') continue;
      if (t === '~' && !st.ch.has(at)) {            // open water: fills an empty bucket, else a wall
        if (st.bucket === 1) add({ ...st, bucket: 2, d: st.d + 1 });
        continue;
      }
      if (t === 'F') {                               // fire: a full bucket puts it out, else deadly
        if (st.bucket === 2) add({ ...st, bucket: 1, ex: new Set(st.ex).add(at), d: st.d + 1 });
        continue;
      }
      if (t === 'x' && st.bk.has(at)) continue;      // broken floor: deadly, like fire
      let cr = st.cr, ch = st.ch, push = 0;
      // leaving cracked floor breaks it (the start tile is never cracked, so this is a first visit)
      const bk = g[py][px] === 'x' ? new Set(st.bk).add(`${px},${py}`) : st.bk;
      const ci = cr.findIndex((c) => c[0] === nx && c[1] === ny);
      if (ci >= 0) {
        const tx = nx + dx, ty = ny + dy, tk = `${tx},${ty}`;
        let u = g[ty][tx];
        if ((u === 'F' && st.ex.has(tk)) || (u === 'b' && st.pk.has(tk))) u = '.';
        if (cr.some((c) => c[0] === tx && c[1] === ty)) continue;
        if (u === '~' && !ch.has(tk)) {                                 // fills the water
          ch = new Set(ch).add(tk);
          cr = cr.filter((_, j) => j !== ci);
        } else if (u === 'F') {                                         // burns up, fire stays
          cr = cr.filter((_, j) => j !== ci);
        } else if (u === '.' || u === 'g') {
          cr = cr.map((c, j) => (j === ci ? [tx, ty] : c));
        } else continue;
        push = 1;
      }
      let bucket = st.bucket, pk = st.pk;
      if (t === 'b' && bucket === 0) { bucket = 1; pk = new Set(pk).add(at); }   // pick up (one at a time)
      add({ p: [nx, ny], cr, ch, bk, bucket, ex: st.ex, pk, m: st.m | bit(nx, ny), push: st.push + push, d: st.d + 1 });
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
  const unknown = [...new Set(rows.join('').replace(/[#.SDgF~cxb]/g, ''))];
  if (unknown.length) problems.push(`unknown tiles: ${unknown.join(' ')}`);
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
  const fixed = fs.readFileSync(file, 'utf8').replace(/export const LEVELS = \[[\s\S]*?\n\];/, (block) =>
    block.replace(/par: \d+,/g, () => `par: ${pars[n++]},`));
  fs.writeFileSync(file, fixed);
  console.log(`\nWrote ${n} par values to src/levels.js. Run again to confirm.`);
  process.exit(0);
}
process.exit(failed ? 1 : 0);
