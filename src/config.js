// Tuning values and lookup tables shared by several modules.

export const SRC = 32;               // tile size in the art (assets/tilesheet.png)
export const STEP = 1 / 60;          // fixed update step

export const MOVE_TIME = 0.12;       // s per tile (walking and pushing)
export const DEATH_TIME = 0.8;       // s of death animation before the level restarts
export const FADE_TIME = 0.35;       // s fade-in when a level starts
export const SWIPE_DIST = 16;        // css px a finger has to travel before it counts as a direction
export const UNDO_LIMIT = 400;
export const EXIT_TIME = 0.65;       // s the player takes to walk into the door
export const BURN_TIME = 0.8;        // s a crate takes to burn up
export const CRUMBLE_TIME = 0.45;    // s the dust of a cracked floor tile breaking further lasts
export const SPLASH_TIME = 0.35;     // s the droplets of filling the bucket last
export const STEAM_TIME = 0.6;       // s the steam of a fire going out lasts
export const RUBBLE_TIME = 0.5;      // s the rubble of a smashed wall lasts
export const THREE_STAR_SLACK = 1.25; // 3 stars: all gold within par * this many steps

// Position of each tile in the tile sheet: [column, row]
export const SPR = {
  water: [0, 0], brick: [1, 0], floor: [3, 0],
  crate: [0, 1], gold: [0, 2], fire: [1, 2], door: [2, 2],
};
export const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
export const FRAMES = 5;             // sprite sheet has 5 poses; frame 0 is the standing pose
