/*
 * Breadth-first solver shared by tools/check-levels.js and tools/generate-levels.js.
 * It mirrors src/rules.js in its own search state, so keep the two in sync when a rule changes.
 *
 * Rules mirrored from src/rules.js: fire is never stepped on; a crate pushed into water becomes a
 * bridge (walkable, crates can't enter it); a crate pushed into fire burns up (the fire stays);
 * cracked floor (x) can be stepped on once: when you step off it, it breaks (X) and stepping on it
 * again kills you, just like fire. Crates can't be pushed onto cracked floor.
 * Bucket (b): picked up by walking onto it (one at a time). Moving into open water with an empty
 * bucket fills it, moving into fire with a full one puts the fire out; either takes a step and the
 * player stays put. Crates can't be pushed onto an unpicked bucket tile.
 * Pickaxe (p): picked up by walking onto it. Moving into a cracked wall (W) with it smashes the wall and
 * breaks the pickaxe; takes a step, the player stays put. Without a pickaxe W is a wall.
 * One tool at a time: walking onto a tool of the other kind swaps them (the one carried stays on that
 * tile; a bucket drops empty); walking onto the same kind leaves it lying. Crates can't enter W or a
 * tile with a tool on it.
 *
 *   solve(rows, { maxStates, traps })
 *     rows       level rows as in src/levels.js (needs a brick border)
 *     maxStates  give up after this many search states (default: no limit); returns { truncated: true }
 *     traps      also compute `trap`: the share of states (not at the door) from which the level can
 *                no longer be won with all gold. 0 = every mistake can be undone by walking on.
 *   returns null when the door can't be reached, else
 *     { moves, pushes, gold, bestGold, par, states, parPushes?, trap?, optimal? }
 *     moves = shortest way to the door, par = shortest way that also collects all gold (null if
 *     impossible), pushes = crate pushes on the shortest way, parPushes = crate pushes on a par
 *     solution, optimal = number of distinct par solutions (with `traps` only).
 */
export function solve(rows, { maxStates = Infinity, traps = false } = {}) {
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
  const toolTiles = [];                        // b and p tiles; their content changes (picked up, swapped)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'b' || g[y][x] === 'p') toolTiles.push([x, y]);
  const toolIndex = new Map(toolTiles.map(([x, y], i) => [`${x},${y}`, i]));
  const full = (1 << golds.size) - 1;
  const bit = (x, y) => (golds.has(`${x},${y}`) ? 1 << golds.get(`${x},${y}`) : 0);
  // State of a search node:
  //   `ch` = water cells filled with a crate (they are bridges now)
  //   `bk` = cracked floor cells that have been stepped on and left (they are broken now)
  //   `bucket` = 0 none, 1 empty, 2 full; `ex` = fires put out; `pick` = 1 while carrying the pickaxe;
  //   `wb` = cracked walls smashed; `tl` = what lies on each tool tile now (one char per tile of the
  //   level that started as b or p, in reading order): b, p or . (nothing)
  const keyOf = (s) =>
    `${s.p}|${s.cr.map((c) => c.join()).sort().join(';')}|${[...s.ch].sort().join(';')}|${[...s.bk].sort().join(';')}` +
    `|${s.bucket}|${[...s.ex].sort().join(';')}|${s.pick}|${[...s.wb].sort().join(';')}|${s.tl}|${s.m}`;

  const first = { p: start, cr: crates, ch: new Set(), bk: new Set(), bucket: 0, ex: new Set(), pick: 0, wb: new Set(), tl: toolTiles.map(([x, y]) => g[y][x]).join(''),
    m: bit(...start), push: 0, d: 0 };
  const queue = [first];
  const index = new Map([[keyOf(first), 0]]);
  const edges = traps ? [] : null;   // flat list of from, to state indices
  let cur = 0, truncated = false;
  const add = (st) => {
    const k = keyOf(st);
    let j = index.get(k);
    if (j === undefined) {
      if (queue.length >= maxStates) { truncated = true; return; }
      j = queue.length;
      index.set(k, j);
      queue.push(st);
    }
    if (edges) edges.push(cur, j);
  };
  // what is on a tile now: fires put out, walls smashed, tools (picked up or swapped)
  const eff = (t, at, s) => {
    if (t === 'F') return s.ex.has(at) ? '.' : 'F';
    if (t === 'W') return s.wb.has(at) ? '.' : 'W';
    if (t === 'b' || t === 'p') return s.tl[toolIndex.get(at)];
    return t;
  };
  const atDoor = (st) => st.p[0] === door[0] && st.p[1] === door[1];
  let shortest = null, parState = null, par = null, bestGold = 0;
  for (let i = 0; i < queue.length; i++) {
    cur = i;
    const st = queue[i];
    const [px, py] = st.p;
    if (atDoor(st)) {
      if (!shortest) shortest = st;
      if (par === null && st.m === full) { par = st.d; parState = st; }
      bestGold = Math.max(bestGold, st.m.toString(2).split('1').length - 1);
      continue;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy, at = `${nx},${ny}`;
      let t = g[ny][nx];
      t = eff(t, at, st);                            // put out / picked up / smashed / pickaxe dropped
      if (t === '#') continue;
      if (t === 'W') {                               // cracked wall: the pickaxe smashes it, else a wall
        if (st.pick) add({ ...st, pick: 0, wb: new Set(st.wb).add(at), d: st.d + 1 });
        continue;
      }
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
        u = eff(u, tk, st);
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
      let bucket = st.bucket, pick = st.pick, tl = st.tl;
      if ((t === 'b' && !bucket) || (t === 'p' && !pick)) {   // a tool: pick it up, swapping a different one in hand
        const i = toolIndex.get(at);
        tl = tl.slice(0, i) + (bucket ? 'b' : pick ? 'p' : '.') + tl.slice(i + 1);
        bucket = t === 'b' ? 1 : 0;
        pick = t === 'p' ? 1 : 0;
      }
      add({ p: [nx, ny], cr, ch, bk, bucket, ex: st.ex, pick, wb: st.wb, tl, m: st.m | bit(nx, ny), push: st.push + push, d: st.d + 1 });
    }
  }
  if (truncated) return { truncated: true, states: queue.length };
  if (!shortest) return null;
  const result = { moves: shortest.d, pushes: shortest.push, gold: golds.size, bestGold, par, states: queue.length };
  if (parState) {
    result.parPushes = parState.push;
    // what a par solution has to use: fires put out (each needs its own bucket fill), cracked tiles crossed
    result.parDouse = parState.ex.size;
    result.parCrack = parState.bk.size;
    result.parDig = parState.wb.size;
  }
  if (traps) {
    // Number of different shortest solutions (paths through the state graph that reach the door with
    // all gold in `par` steps). Open rooms have thousands, tight puzzles a handful.
    if (parState) {
      const ways = new Float64Array(queue.length);
      ways[0] = 1;
      for (let e = 0; e < edges.length; e += 2) {
        if (queue[edges[e + 1]].d === queue[edges[e]].d + 1) ways[edges[e + 1]] += ways[edges[e]];
      }
      result.optimal = 0;
      queue.forEach((st, i) => { if (atDoor(st) && st.m === full && st.d === par) result.optimal += ways[i]; });
    }
    // Walk the state graph backwards from every winning state (door, all gold). A state that is not
    // reached can no longer be won. Door states end the level, so they are not counted as traps.
    const back = Array.from({ length: queue.length }, () => []);
    for (let e = 0; e < edges.length; e += 2) back[edges[e + 1]].push(edges[e]);
    const good = new Uint8Array(queue.length);
    const todo = [];
    queue.forEach((st, i) => { if (atDoor(st) && st.m === full) { good[i] = 1; todo.push(i); } });
    while (todo.length) for (const j of back[todo.pop()]) if (!good[j]) { good[j] = 1; todo.push(j); }
    let live = 0, dead = 0;
    queue.forEach((st, i) => { if (!atDoor(st)) (good[i] ? live++ : dead++); });
    result.trap = live + dead ? dead / (live + dead) : 0;
  }
  return result;
}
