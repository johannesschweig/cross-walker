#!/bin/sh
# Builds the web-sized music from the original track (assets/sounds/music.mp3):
#   assets/sounds/music-web.mp3   128 kbps copy that the game streams (3 MB instead of 8 MB)
#   assets/sounds/music-data.js   the same file as base64 text; game.js only loads it as a fallback
#                                 when the browser can't stream the mp3 (file://, static previews,
#                                 servers without byte-range support)
# Needs ffmpeg. Run it again whenever music.mp3 changes.
set -e
cd "$(dirname "$0")/.."
ffmpeg -y -v error -i assets/sounds/music.mp3 -vn -ac 2 -b:a 128k -map_metadata -1 assets/sounds/music-web.mp3
{
  printf 'window.CW_MUSIC="'
  base64 < assets/sounds/music-web.mp3 | tr -d '\n'
  printf '";\n'
} > assets/sounds/music-data.js
ls -l assets/sounds/music-web.mp3 assets/sounds/music-data.js
