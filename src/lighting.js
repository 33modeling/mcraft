// Voxel light propagation: sky light (sunlight) and block light (emitters).
//
// Light is computed per chunk over a 1-block padded volume so that faces on the
// chunk border read correct neighbour light. Sky light floods down a column at
// full strength until it hits an opaque block, then both lights spread outward
// losing one level per step (Amanatides-style BFS). The result is stored as two
// Uint8Arrays (0..15) that the mesher samples per face.

import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex, floorDiv, mod } from './constants.js';
import { BLOCKS, AIR, isOpaque } from './blocks.js';

const PW = CHUNK_SIZE + 2; // padded width along x and z (covers -1..CHUNK_SIZE)
const PLANE = PW * PW;
const PVOL = WORLD_HEIGHT * PLANE;

// Index into a padded array. x,z valid in [-1, CHUNK_SIZE], y in [0, WORLD_HEIGHT).
export function idxP(x, y, z) {
  return y * PLANE + (z + 1) * PW + (x + 1);
}

export function emission(id) {
  const def = BLOCKS[id];
  return def && def.emission ? def.emission : 0;
}

export function computeChunkLight(world, chunk) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const sky = new Uint8Array(PVOL);
  const blk = new Uint8Array(PVOL);
  const op = new Uint8Array(PVOL); // 1 = opaque (blocks light)

  const skyQ = [];
  const blkQ = [];

  // Seed: opacity, downward sky light per column, and emitter block light.
  // Each padded column resolves its chunk once and reads blocks directly.
  for (let z = -1; z <= CHUNK_SIZE; z++) {
    for (let x = -1; x <= CHUNK_SIZE; x++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      const col = world.getChunk(floorDiv(wx, CHUNK_SIZE), floorDiv(wz, CHUNK_SIZE));
      const lx = mod(wx, CHUNK_SIZE);
      const lz = mod(wz, CHUNK_SIZE);
      let openToSky = true;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = col ? col.blocks[blockIndex(lx, y, lz)] : AIR;
        const i = idxP(x, y, z);
        const opaque = isOpaque(id);
        op[i] = opaque ? 1 : 0;
        if (openToSky) {
          if (opaque) openToSky = false;
          else {
            sky[i] = 15;
            skyQ.push(i);
          }
        }
        const e = emission(id);
        if (e > 0) {
          blk[i] = e;
          blkQ.push(i);
        }
      }
    }
  }

  const decode = (i) => {
    const y = (i / PLANE) | 0;
    const rem = i - y * PLANE;
    const pz = (rem / PW) | 0;
    const px = rem - pz * PW;
    return [px - 1, y, pz - 1];
  };

  const inRange = (x, y, z) =>
    x >= -1 && x <= CHUNK_SIZE && z >= -1 && z <= CHUNK_SIZE && y >= 0 && y < WORLD_HEIGHT;

  // Sky-light BFS (sunlight keeps full strength going straight down).
  let head = 0;
  while (head < skyQ.length) {
    const i = skyQ[head++];
    const level = sky[i];
    if (level <= 1) continue;
    const [x, y, z] = decode(i);
    trySky(x + 1, y, z, level - 1);
    trySky(x - 1, y, z, level - 1);
    trySky(x, y, z + 1, level - 1);
    trySky(x, y, z - 1, level - 1);
    trySky(x, y + 1, z, level - 1);
    trySky(x, y - 1, z, level === 15 ? 15 : level - 1);
  }

  function trySky(x, y, z, nl) {
    if (nl <= 0 || !inRange(x, y, z)) return;
    const i = idxP(x, y, z);
    if (op[i] || sky[i] >= nl) return;
    sky[i] = nl;
    skyQ.push(i);
  }

  // Block-light BFS (always loses one level per step).
  head = 0;
  while (head < blkQ.length) {
    const i = blkQ[head++];
    const level = blk[i];
    if (level <= 1) continue;
    const [x, y, z] = decode(i);
    tryBlk(x + 1, y, z, level - 1);
    tryBlk(x - 1, y, z, level - 1);
    tryBlk(x, y, z + 1, level - 1);
    tryBlk(x, y, z - 1, level - 1);
    tryBlk(x, y + 1, z, level - 1);
    tryBlk(x, y - 1, z, level - 1);
  }

  function tryBlk(x, y, z, nl) {
    if (nl <= 0 || !inRange(x, y, z)) return;
    const i = idxP(x, y, z);
    if (op[i] || blk[i] >= nl) return;
    blk[i] = nl;
    blkQ.push(i);
  }

  return { sky, blk };
}
