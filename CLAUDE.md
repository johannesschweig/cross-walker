# Cross Walker

Portrait-only tile puzzle game for phones (also works on desktop). Plain HTML/CSS/JS in ES modules, bundled with Vite (the only dependency, dev-only). Live at https://cross-walker.vercel.app. The original Godot 4.3 prototype is in git history (before the squashed web-port commit).

## Commands

```bash
npm install                          # once
npm run dev                          # dev server, open http://localhost:8123
npm run build                        # production build into dist/ (also writes dist/sw.js)
npm run preview                      # serve dist/ on http://localhost:8123
npm run check                        # verify levels: solvable, all gold collectable, par correct (-- --write fixes par)
tools/make-music-data.sh             # rebuild music-web.mp3 + music-data.js from music.mp3 (needs ffmpeg)
vercel --prod                        # deploy (project "cross-walker"; Vercel runs the build and serves dist/)
```

There is no test suite or linter. After changing code run `npm run build` (catches broken imports); after touching levels or `src/rules.js`, run `npm run check`.

## Files

- `index.html`: layout (header / board / footer), overlays, d-pad, rotate prompt. `src/style.css` is its stylesheet.
- `src/main.js`: entry point. Connects the modules and runs the main loop. The module map is in its header comment.
- `src/levels.js` (level data), `config.js` (constants), `state.js` (the mutable `game` and `player` objects), `storage.js` (all localStorage).
- `src/rules.js` (one step: pushing, fire, gold, door), `undo.js`, `game.js` (load level, `update(dt)`, finishing a level).
- `src/input.js` (keys, swipes, d-pad), `audio.js`, `render.js` (canvas drawing), `ui.js` (HUD, panels, level picker), `dom.js` (element handles).
- `src/assets/`: `tilesheet.png` and `spritesheet.png` (32 px art) and sounds. Imported from JS, so Vite hashes the file names.
- `public/`: copied to `dist/` as it is: `manifest.webmanifest` and `icons/`.
- `src/sw.js`: offline cache template. `vite.config.js` fills in the file list and cache name at build time and writes `dist/sw.js`.
- `assets-src/`: Affinity sources and the original `music.mp3`. Not deployed. `vercel.json`, `.vercelignore`: hosting.

## How the game works

- Tile-based: one step per move (`MOVE_TIME`, in `config.js`), fixed 60 Hz `update(dt)`, rendering every animation frame.
- Level tiles: `#` brick, `.` floor, `S` start, `D` door, `g` gold, `F` fire, `~` water, `c` crate. At runtime a filled water tile becomes `w` (water with a floating crate, walkable). `S` and `c` are lifted out of the grid on load.
- Rules: fire kills, restarts the level and drops the gold picked up in it (`goldAtLevelStart`); a crate pushed into water becomes a bridge; a crate pushed into fire burns up and the fire stays; crates can't be pushed onto bridges, the door, bricks or other crates; no pulling.
- Stars: 1 = finished, 2 = all gold, 3 = all gold within `ceil(par * THREE_STAR_SLACK)` steps. `par` is stored per level and verified by `tools/check-levels.js`. A level ends with an `exiting` animation, then a result panel (`mode: 'result'`); `completeLevel()` (in `game.js`) saves the best result.
- Animations are drawn in `draw()` (`render.js`) from `game.time` (water ripples, fire glow/flame/embers, floating-crate bob) and `game.effects` (burning crate); the door exit is the `exiting` mode. They are purely visual, so keep logic out of them.
- Rendering uses whole device pixels per tile (`floor(canvasPx / max(w, h))`) so tiles never leave seams. The canvas is sized in `fitCanvas()` (`render.js`); don't scale it with CSS.
- Input: keyboard, swipe/drag on `#stage` (pointer events), and the optional d-pad all feed `press()`/`release()`. Z/Backspace undo exists on keyboards only (there is no undo button, on purpose).
- Saved in `localStorage`: `cw-progress` (next level + gold at its start), `cw-stars` (best stars and steps per level), `cw-muted`, `cw-dpad`.

## Rules for changes

- Crates make levels easy to break. Every level must pass `npm run check`: solvable, all gold collectable, correct `par`, border of bricks, exactly one `S` and one `D`. Changing a rule (like what crates do in fire) can shortcut or break existing levels: re-run the checker and compare step counts.
- Audio: stream `src/assets/sounds/music-web.mp3` with an `<audio>` element. Don't fetch it: fetch fails in static previews. `music-data.js` is the Web Audio fallback, a 4 MB base64 ES module that `audio.js` loads with a dynamic `import()` only when streaming fails. `src/sw.js` must never handle audio, range requests or `music-data`.
- `tools/check-levels.js` imports `src/levels.js` and mirrors `src/rules.js` in its own solver. Keep `levels.js` a plain module (`export const LEVELS = [...]`, closing `];` at column 0): `--write` rewrites it with a regex.
- Module layering: `config`/`levels`/`dom`/`state` are leaves; `ui` and `rules` import from `input`, `render`, `audio`, `storage`; `game` imports `rules` and `ui`; only `main` knows everything. Don't import `game` or `rules` from `ui`/`input`: pass callbacks in from `main.js` (see `initInput`) to avoid import cycles.
- The service worker file list and cache name are generated in `vite.config.js`, so there is nothing to bump by hand. The SW is only registered in production builds.
- Game-wide state goes on the `game`/`player` objects in `state.js`: a module-level `let` can't be assigned from other modules.
- Keep it portrait-only (rotate screen on touch devices in landscape). Don't add runtime dependencies.

## Testing notes

- The in-app browser pane throttles `requestAnimationFrame` (about 2 fps) and blocks service workers. To test game logic there, start the `dev` server (`.claude/launch.json`) and import the modules from the page console: `const G = await import('/src/game.js'); const S = await import('/src/state.js'); const I = await import('/src/input.js')`. These are the same instances the app uses (import them before editing files: hot reload gives edited modules a new URL). Drive the game with `I.press(dir)`, one `G.update(1/60)`, `I.release(dir)`, then more `G.update(1/60)` until `S.player.moving` is false; read `S.game` and `S.player`. No debug hook in the source is needed.
- To look at a timed animation, freeze it: set an effect's `dur` very large and `t` to the fraction you want, or set `game.mode = 'exiting'` with a small `modeTime`, then screenshot.
- Test the production build too (`preview` in `.claude/launch.json`): it uses hashed file names and the generated `dist/sw.js`.
- Phone layout: use the pane's Mobile preset (375×812). A 667×375 size with touch emulation shows the rotate prompt.

## Deploy and git

- Vercel project `cross-walker` was created with the CLI. `vercel.json` sets the build command (`npm run build`) and output directory (`dist`). Pushes do not deploy until the project is connected to GitHub (`vercel git connect`).
- `dist/` and `node_modules/` are git-ignored.
- Don't create Vercel protection-bypass secrets or change deployment protection without asking.
- The `GITHUB_TOKEN` in this environment may be read-only; a push can fail with 403.
