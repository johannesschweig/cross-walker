# Cross Walker

A tiny puzzle game for phones: collect gold, dodge fire, bridge rivers with crates, don't trust cracked floor. 14 levels, each with up to three stars. Plain HTML/CSS/JavaScript, bundled with [Vite](https://vite.dev).

**Play:** https://cross-walker.vercel.app

Originally a Godot 4.3 prototype; that version is in the git history.

## How to play

- You move one tile per step. Walk onto the **door** to finish a level.
- **Gold** is optional, and every level lets you collect all of it.
- **Fire** kills you: the level restarts and you lose the gold you picked up in it.
- **Water** blocks you. Push a **crate** into it and it floats there as a bridge.
- Push a **crate into fire** and the crate burns up (the fire stays). That's how you get rid of a crate you don't need.
- **Cracked floor** holds you once. Step off it and it breaks; step on it again and it collapses under you, like fire. Crates can't be pushed onto it.
- Crates move one tile in a straight line. They can't be pulled or pushed onto a bridge.
- **Stars:** ★ for finishing, ★★ for also collecting all the gold, ★★★ for doing that within 25% of par (the fewest steps that collect all the gold). Your best result per level is saved.

| | Phone | Keyboard |
| --- | --- | --- |
| Walk | Swipe anywhere on the board (hold to keep walking), or turn on the D-pad | Arrows / WASD |
| Restart level | Restart button | R |
| Undo last step | – | Z or Backspace |
| Sound | Sound button | M |
| Pick a level | Tap "Level n/14" | Click "Level n/14" |

The game is portrait-only. Progress, sound and d-pad settings are saved in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:8123, or `http://<your-computer's-ip>:8123` on a phone on the same Wi-Fi (the dev server listens on the network when started with `npm run dev -- --host`).

`npm run build` writes the site to `dist/`; `npm run preview` serves that build locally.

## Deploy

Static site; Vercel runs `npm run build` and serves `dist/`:

```bash
vercel --prod
```

## Editing levels

Levels are the `LEVELS` array in `src/levels.js`: text grids with a brick border, drawn as large as fits. Each has a `par` (see Stars above).

| Char | Tile | | Char | Tile |
| --- | --- | --- | --- | --- |
| `#` | brick | | `F` | fire |
| `.` | floor | | `~` | water |
| `S` | start (one) | | `c` | crate |
| `D` | door (one) | | `g` | gold |
| `x` | cracked floor | | | |

Crates make levels easy to break, so check them after every change. The checker confirms each level is solvable with all its gold collectable, and that `par` is right (`--write` fixes wrong par values):

```bash
npm run check
```

## Music

`assets-src/sounds/music.mp3` is the original track. The game streams a smaller 128 kbps copy (`src/assets/sounds/music-web.mp3`) and falls back to `music-data.js` (the same copy as text, loaded only when needed) where streaming isn't possible. Rebuild both with `tools/make-music-data.sh` (needs ffmpeg).

More details for contributors are in [CLAUDE.md](CLAUDE.md).
