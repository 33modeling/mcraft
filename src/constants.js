// Global tunables and small shared helpers for the voxel world.

export const CHUNK_SIZE = 16;       // blocks along X and Z within a chunk
export const WORLD_HEIGHT = 128;    // blocks along Y (0 .. WORLD_HEIGHT-1)
export const SEA_LEVEL = 62;        // water fills up to (and including) this y

export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;

export const RENDER_DISTANCE = 9;   // chunks loaded in each direction from player
                                    // (meshing is offloaded to a Web Worker)

// Physics (units are blocks and seconds).
export const GRAVITY = 30;
export const JUMP_SPEED = 9.0;
export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 7.2;
export const FLY_SPEED = 13;
export const FLY_SPRINT_SPEED = 26;
export const TERMINAL_VELOCITY = 56;

// Player collision box and eye placement.
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;

export const REACH = 6;              // max block interaction distance
export const WORLD_SEED = 1337;

// Index a block inside a chunk's flat Uint8Array.
// Layout: y-major, then z, then x  ->  idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x
export function blockIndex(x, y, z) {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

// Floor division / modulo that behave correctly for negative coordinates.
export function floorDiv(a, b) {
  return Math.floor(a / b);
}

export function mod(a, b) {
  return ((a % b) + b) % b;
}
