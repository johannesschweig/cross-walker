#!/usr/bin/env node
/*
 * Checks every level in src/levels.js: well-formed, solvable, all gold collectable on a run that ends
 * at the door, and `par` correct (par = fewest steps that collect all gold and reach the door).
 * Also prints the shortest way to the door (steps / crate pushes).
 *
 *   node tools/check-levels.js          check; exit code 1 if anything is wrong
 *   node tools/check-levels.js --write  also fix wrong `par` values in src/levels.js
 *
 * The search itself lives in tools/solver.js (it mirrors the rules of src/rules.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve } from './solver.js';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'levels.js');
const { LEVELS } = await import(pathToFileURL(file).href);

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
