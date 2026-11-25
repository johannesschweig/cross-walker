# Cross Walker

A tiny puzzle game for phones: collect gold, dodge fire, bridge rivers with crates. 12 levels. Plain HTML/CSS/JavaScript, no build step.

**Play:** https://cross-walker.vercel.app

Originally a Godot 4.3 prototype; that version is in the git history.

## How to play

- You move one tile per step. Walk onto the **door** to finish a level.
- **Gold** is optional, and every level lets you collect all of it.
- **Fire** kills you: you lose all your gold and the level restarts.
- **Water** blocks you. Push a **crate** into it and it floats there as a bridge.
- Crates move one tile in a straight line. They can't be pulled or pushed onto a bridge.

| | Phone | Keyboard |
| --- | --- | --- |
| Walk | Swipe anywhere on the board (hold to keep walking), or turn on the D-pad | Arrows / WASD |
| Restart level | Restart button | R |
| Undo last step | – | Z or Backspace |
| Sound | Sound button | M |
| Pick a level | Tap "Level n/12" | Click "Level n/12" |

The game is portrait-only. Progress, sound and d-pad settings are saved in the browser.

## Run locally

```bash
python3 -m http.server 8123
```

Open http://localhost:8123, or `http://<your-computer's-ip>:8123` on a phone on the same Wi-Fi.

## Deploy

Static site, nothing to build:

```bash
vercel --prod
```

## Editing levels

Levels are the `LEVELS` array at the top of `game.js`: text grids with a brick border, drawn as large as fits.

| Char | Tile | | Char | Tile |
| --- | --- | --- | --- | --- |
| `#` | brick | | `F` | fire |
| `.` | floor | | `~` | water |
| `S` | start (one) | | `c` | crate |
| `D` | door (one) | | `g` | gold |

Crates make levels easy to break, so check them after every change:

```bash
node tools/check-levels.js
```

## Music

`assets/sounds/music.mp3` is the original track. The game streams a smaller 128 kbps copy (`music-web.mp3`) and falls back to `music-data.js` (the same copy as text) where streaming isn't possible. Rebuild both with `tools/make-music-data.sh` (needs ffmpeg).

More details for contributors are in [CLAUDE.md](CLAUDE.md).
