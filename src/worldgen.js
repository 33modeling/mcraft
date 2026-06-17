// Procedural terrain generation. Each chunk is generated independently and
// deterministically from world coordinates, so neighbouring chunks line up and
// trees that straddle a chunk border are stamped identically from both sides.

import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, WORLD_SEED } from './constants.js';
import { hash3 } from './noise.js';
import {
  AIR,
  GRASS,
  DIRT,
  STONE,
  SAND,
  WATER,
  BEDROCK,
  SNOW,
  OAK_LOG,
  OAK_LEAVES,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
} from './blocks.js';

const TREE_CELL = 5; // trees are sampled one-per-cell on a 5x5 grid

// Surface description at a world column. Pure function of (wx, wz).
export function surfaceInfo(noise, wx, wz) {
  const continent = noise.fbm2D(wx / 220, wz / 220, 4);
  const hills = noise.fbm2D((wx + 1000) / 70, (wz + 1000) / 70, 4);
  const detail = noise.fbm2D((wx - 500) / 28, (wz - 500) / 28, 3);

  let h = SEA_LEVEL + continent * 22 + hills * 9 + detail * 3;
  h = Math.round(h);
  if (h < 4) h = 4;
  if (h > WORLD_HEIGHT - 10) h = WORLD_HEIGHT - 10;

  let top;
  if (h <= SEA_LEVEL + 1) top = SAND;
  else if (h >= 92) top = SNOW;
  else top = GRASS;

  return { height: h, top };
}

function oreAt(wx, y, wz, height) {
  if (y > height - 4) return 0;
  const r = hash3(wx, y, wz, WORLD_SEED + 4099);
  if (y < 14 && r < 0.0016) return DIAMOND_ORE;
  if (y < 22 && r < 0.004) return GOLD_ORE;
  if (y < 48 && r < 0.013) return IRON_ORE;
  if (r < 0.022) return COAL_ORE;
  return 0;
}

function setLocal(chunk, wx, wy, wz, id, overwrite) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return;
  const lx = wx - chunk.cx * CHUNK_SIZE;
  const lz = wz - chunk.cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
  if (!overwrite && chunk.get(lx, wy, lz) !== AIR) return;
  chunk.set(lx, wy, lz, id);
}

function stampTree(chunk, wx, baseY, wz) {
  const trunkH = 4 + Math.floor(hash3(wx, 7, wz, WORLD_SEED + 21) * 3); // 4..6
  const topY = baseY + trunkH;

  // Leaf canopy: wider at the bottom, capped on top, with nibbled corners.
  for (let dy = -2; dy <= 1; dy++) {
    const ly = topY + dy;
    const radius = dy <= -1 ? 2 : 1;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (
          Math.abs(dx) === radius &&
          Math.abs(dz) === radius &&
          (dy >= 0 || hash3(wx + dx, ly, wz + dz, WORLD_SEED + 33) < 0.55)
        ) {
          continue; // trim corners for a rounder crown
        }
        setLocal(chunk, wx + dx, ly, wz + dz, OAK_LEAVES, false);
      }
    }
  }

  // Trunk overwrites whatever air/leaves were placed in its column.
  for (let y = 1; y <= trunkH; y++) {
    setLocal(chunk, wx, baseY + y, wz, OAK_LOG, true);
  }
}

export function generateChunk(world, chunk, noise) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  // 1) Terrain columns.
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const info = surfaceInfo(noise, wx, wz);
      const h = info.height;

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) {
          id = BEDROCK;
        } else if (y <= 2) {
          id = hash3(wx, y, wz, WORLD_SEED + 7) < 0.6 ? BEDROCK : STONE;
        } else if (y === h) {
          id = info.top;
        } else if (y >= h - 3) {
          id = info.top === SAND ? SAND : DIRT;
        } else {
          id = oreAt(wx, y, wz, h) || STONE;
        }
        chunk.set(lx, y, lz, id);
      }

      // Water fills from just above the floor up to sea level.
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        chunk.set(lx, y, lz, WATER);
      }
    }
  }

  // 2) Trees. Scan every grid cell whose tree could reach into this chunk
  //    (canopy radius 2), and stamp the parts that land inside it.
  const gx0 = Math.floor((baseX - 2) / TREE_CELL);
  const gx1 = Math.floor((baseX + CHUNK_SIZE + 1) / TREE_CELL);
  const gz0 = Math.floor((baseZ - 2) / TREE_CELL);
  const gz1 = Math.floor((baseZ + CHUNK_SIZE + 1) / TREE_CELL);

  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      if (hash3(gx, 3, gz, WORLD_SEED + 13) >= 0.42) continue; // not every cell has a tree
      const jx = Math.floor(hash3(gx, 1, gz, WORLD_SEED + 11) * TREE_CELL);
      const jz = Math.floor(hash3(gx, 2, gz, WORLD_SEED + 12) * TREE_CELL);
      const wx = gx * TREE_CELL + jx;
      const wz = gz * TREE_CELL + jz;

      const info = surfaceInfo(noise, wx, wz);
      if (info.top !== GRASS || info.height <= SEA_LEVEL) continue;
      stampTree(chunk, wx, info.height, wz);
    }
  }

  chunk.generated = true;
  chunk.dirty = true;
}
