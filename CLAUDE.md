# Cross Walker

Portrait-only tile puzzle game for phones (also works on desktop). Plain HTML/CSS/JS, no build step, no dependencies. Live at https://cross-walker.vercel.app. The original Godot 4.3 prototype is in git history (before the squashed web-port commit).

## Commands

```bash
python3 -m http.server 8123          # run locally, open http://localhost:8123
node tools/check-levels.js           # verify every level is solvable with all gold collectable
tools/make-music-data.sh             # rebuild music-web.mp3 + music-data.js from music.mp3 (needs ffmpeg)
vercel --prod                        # deploy (project "cross-walker", static, no build)
```

There is no test suite or linter. After changing `game.js`, run `node --check game.js`; after touching levels, run `tools/check-levels.js`.

## Files

- `index.html`, `style.css`: layout (header / board / footer), overlays, d-pad, rotate prompt.
- `game.js`: everything else, in one IIFE: `LEVELS`, state, input, rules, rendering, audio.
- `sw.js`: offline cache. `manifest.webmanifest` + `icons/`: installable app. `vercel.json`, `.vercelignore`: hosting.
- `assets/`: `tilesheet.png` and `spritesheet.png` (32 px art), sounds, Affinity sources.

## How the game works

- Tile-based: one step per move (`MOVE_TIME`), fixed 60 Hz `update(dt)`, rendering every animation frame.
- Level tiles: `#` brick, `.` floor, `S` start, `D` door, `g` gold, `F` fire, `~` water, `c` crate. At runtime a filled water tile becomes `w` (water with a floating crate, walkable). `S` and `c` are lifted out of the grid on load.
- Rules: fire kills and resets gold to 0; a crate pushed into water becomes a bridge; crates can't be pushed onto bridges, fire, the door or other crates; no pulling.
- Rendering uses whole device pixels per tile (`floor(canvasPx / max(w, h))`) so tiles never leave seams. The canvas is sized in `fitCanvas()`; don't scale it with CSS.
- Input: keyboard, swipe/drag on `#stage` (pointer events), and the optional d-pad all feed `press()`/`release()`. Z/Backspace undo exists on keyboards only (there is no undo button, on purpose).
- Saved in `localStorage`: `cw-progress` (level + gold at level start), `cw-muted`, `cw-dpad`.

## Rules for changes

- Crates make levels easy to break. Every level must pass `node tools/check-levels.js`: solvable, all gold collectable, border of bricks, exactly one `S` and one `D`.
- Audio: stream `assets/sounds/music-web.mp3` with an `<audio>` element. Don't fetch it: fetch fails in file:// pages and static previews. `music-data.js` is the Web Audio fallback. `sw.js` must never handle audio or range requests.
- Bump `CACHE` in `sw.js` if you change its `CORE` file list.
- Keep it dependency-free and portrait-only (rotate screen on touch devices in landscape).

## Testing notes

- The in-app browser pane throttles `requestAnimationFrame` (about 2 fps) and blocks service workers. To test game logic there, expose `update`, `game`, `player` temporarily (for example on `window.__cw` under `#debug`) and call `update(1/60)` in a loop. Remove the hook before committing.
- The dev server and the browser cache `style.css` and `game.js`; hard reload after edits.
- Phone layout: use the pane's Mobile preset (375×812). A 667×375 size with touch emulation shows the rotate prompt.

## Deploy and git

- Vercel project `cross-walker` was created with the CLI. Pushes do not deploy until the project is connected to GitHub (`vercel git connect`).
- Don't create Vercel protection-bypass secrets or change deployment protection without asking.
- The `GITHUB_TOKEN` in this environment may be read-only; a push can fail with 403.
