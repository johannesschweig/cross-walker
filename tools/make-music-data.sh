#!/bin/sh
# Builds the web-sized music from the original track (assets-src/sounds/music.mp3):
#   src/assets/sounds/music-web.mp3   128 kbps copy that the game streams (3 MB instead of 8 MB)
#   src/assets/sounds/music-data.js   the same file as base64 text (an ES module). audio.js loads it
#                                     lazily as a fallback when the browser can't stream the mp3
#                                     (e.g. servers without byte-range support)
# Needs ffmpeg. Run it again whenever music.mp3 changes.
set -e
cd "$(dirname "$0")/.."
ffmpeg -y -v error -i assets-src/sounds/music.mp3 -vn -ac 2 -b:a 128k -map_metadata -1 src/assets/sounds/music-web.mp3
{
  printf 'export default "'
  base64 < src/assets/sounds/music-web.mp3 | tr -d '\n'
  printf '";\n'
} > src/assets/sounds/music-data.js
ls -l src/assets/sounds/music-web.mp3 src/assets/sounds/music-data.js
