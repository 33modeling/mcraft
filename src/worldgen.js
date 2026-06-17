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
  CACTUS,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
} from './blocks.js';

const TREE_CELL = 5; // trees/cacti are sampled one-per-cell on a 5x5 grid

export const PLAINS = 0;
export const FOREST = 1;
export const DESERT = 2;
export const SNOWY = 3;

// Biome from temperature + humidity noise. Pure function of (wx, wz).
export function biomeAt(noise, wx, wz) {
  const temp = noise.fbm2D((wx + 5000) / 420, (wz + 5000) / 420, 3);
  const humid = noise.fbm2D((wx - 7000) / 420, (wz - 7000) / 420, 3);
  if (temp > 0.33 && humid < 0.0) return DESERT;
  if (temp < -0.33) return SNOWY;
  if (humid > 0.18) return FOREST;
  return PLAINS;
}

// Surface description at a world column. Pure function of (wx, wz).
export function surfaceInfo(noise, wx, wz) {
  const continent = noise.fbm2D(wx / 220, wz / 220, 4);
  const hills = noise.fbm2D((wx + 1000) / 70, (wz + 1000) / 70, 4);
  const detail = noise.fbm2D((wx - 500) / 28, (wz - 500) / 28, 3);

  let h = SEA_LEVEL + continent * 22 + hills * 9 + detail * 3;
  h = Math.round(h);
  if (h < 4) h = 4;
  if (h > WORLD_HEIGHT - 10) h = WORLD_HEIGHT - 10;

  const biome = biomeAt(noise, wx, wz);
  let top;
  if (h <= SEA_LEVEL + 1) top = SAND; // beaches / lake beds
  else if (h >= 92 || biome === SNOWY) top = SNOW; // peaks and cold biomes
  else if (biome === DESERT) top = SAND;
  else top = GRASS;

  return { height: h, top, biome };
}

// Sparse winding caves: carve where two 3D noise fields are both near zero.
function isCave(noise, wx, wy, wz) {
  const n1 = noise.perlin3D(wx * 0.045, wy * 0.07, wz * 0.045);
  const n2 = noise.perlin3D(wx * 0.045 + 120, wy * 0.07 + 120, wz * 0.045 + 120);
  return Math.abs(n1) < 0.066 && Math.abs(n2) < 0.066;
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

function stampCactus(chunk, wx, baseY, wz) {
  const h = 1 + Math.floor(hash3(wx, 5, wz, WORLD_SEED + 71) * 3); // 1..3 tall
  for (let i = 1; i <= h; i++) {
    setLocal(chunk, wx, baseY + i, wz, CACTUS, false);
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
          // Deep stone band: carve caves, otherwise stone (with ore veins).
          id = isCave(noise, wx, y, wz) ? AIR : oreAt(wx, y, wz, h) || STONE;
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
      const dens = hash3(gx, 3, gz, WORLD_SEED + 13);
      const jx = Math.floor(hash3(gx, 1, gz, WORLD_SEED + 11) * TREE_CELL);
      const jz = Math.floor(hash3(gx, 2, gz, WORLD_SEED + 12) * TREE_CELL);
      const wx = gx * TREE_CELL + jx;
      const wz = gz * TREE_CELL + jz;

      const info = surfaceInfo(noise, wx, wz);
      if (info.height <= SEA_LEVEL) continue;

      if (info.biome === DESERT) {
        // Cacti grow on sand, fairly sparsely.
        if (info.top === SAND && dens < 0.16) stampCactus(chunk, wx, info.height, wz);
      } else if (info.top === GRASS || info.top === SNOW) {
        // Forests are dense; plains/snowy are sparse.
        const threshold = info.biome === FOREST ? 0.55 : info.biome === SNOWY ? 0.18 : 0.13;
        if (dens < threshold) stampTree(chunk, wx, info.height, wz);
      }
    }
  }

  // 3) Re-apply any player edits recorded for this chunk.
  world.applyEdits(chunk);

  chunk.generated = true;
  chunk.dirty = true;
}
