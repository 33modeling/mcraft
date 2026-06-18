// Block registry. Each block has an id, display name, rendering flags, and the
// procedural texture names used per face. Texture names are resolved into atlas
// tiles by textures.js; the mesher picks top/bottom/side per face.

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLESTONE = 4;
export const OAK_LOG = 5;
export const OAK_LEAVES = 6;
export const OAK_PLANKS = 7;
export const SAND = 8;
export const GLASS = 9;
export const WATER = 10;
export const BEDROCK = 11;
export const COAL_ORE = 12;
export const IRON_ORE = 13;
export const GOLD_ORE = 14;
export const DIAMOND_ORE = 15;
export const BRICK = 16;
export const SNOW = 17;
export const GLOWSTONE = 18;
export const TORCH = 19;
export const CACTUS = 20;
export const FURNACE = 21;

// `solid`: participates in collision and stops the player.
// `opaque`: fully hides the neighbouring face behind it (face culling).
// `render`: produces geometry at all (air does not).
// `liquid`: rendered but not collidable; faces between same liquid are skipped.
function block(name, textures, opts = {}) {
  return {
    name,
    textures, // { top, bottom, side } or { all }
    solid: opts.solid !== undefined ? opts.solid : true,
    opaque: opts.opaque !== undefined ? opts.opaque : true,
    render: opts.render !== undefined ? opts.render : true,
    liquid: !!opts.liquid,
    transparent: !!opts.transparent, // uses the transparent render pass
    emission: opts.emission || 0, // 0..15 block-light output
  };
}

export const BLOCKS = {
  [AIR]: { name: 'air', solid: false, opaque: false, render: false, liquid: false, transparent: false, textures: null },
  [GRASS]: block('Grass', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }),
  [DIRT]: block('Dirt', { all: 'dirt' }),
  [STONE]: block('Stone', { all: 'stone' }),
  [COBBLESTONE]: block('Cobblestone', { all: 'cobblestone' }),
  [OAK_LOG]: block('Oak Log', { top: 'log_top', bottom: 'log_top', side: 'log_side' }),
  [OAK_LEAVES]: block('Oak Leaves', { all: 'leaves' }),
  [OAK_PLANKS]: block('Oak Planks', { all: 'planks' }),
  [SAND]: block('Sand', { all: 'sand' }),
  [GLASS]: block('Glass', { all: 'glass' }, { opaque: false, transparent: true }),
  [WATER]: block('Water', { all: 'water' }, { solid: false, opaque: false, transparent: true, liquid: true }),
  [BEDROCK]: block('Bedrock', { all: 'bedrock' }),
  [COAL_ORE]: block('Coal Ore', { all: 'coal_ore' }),
  [IRON_ORE]: block('Iron Ore', { all: 'iron_ore' }),
  [GOLD_ORE]: block('Gold Ore', { all: 'gold_ore' }),
  [DIAMOND_ORE]: block('Diamond Ore', { all: 'diamond_ore' }),
  [BRICK]: block('Bricks', { all: 'brick' }),
  [SNOW]: block('Snow', { all: 'snow' }),
  [GLOWSTONE]: block('Glowstone', { all: 'glowstone' }, { emission: 15 }),
  [TORCH]: block('Torch', { all: 'torch' }, { emission: 14 }),
  [CACTUS]: block('Cactus', { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }),
  [FURNACE]: block('Furnace', { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_front' }),
};

// Resolve the texture name for a given block id and face direction.
// faceDir is one of '+y' | '-y' | 'side'.
export function textureForFace(id, faceDir) {
  const def = BLOCKS[id];
  if (!def || !def.textures) return null;
  const t = def.textures;
  if (t.all) return t.all;
  if (faceDir === '+y') return t.top;
  if (faceDir === '-y') return t.bottom;
  return t.side;
}

// Every unique texture name referenced by any block (for atlas building).
export function allTextureNames() {
  const set = new Set();
  for (const id in BLOCKS) {
    const t = BLOCKS[id].textures;
    if (!t) continue;
    if (t.all) set.add(t.all);
    if (t.top) set.add(t.top);
    if (t.bottom) set.add(t.bottom);
    if (t.side) set.add(t.side);
  }
  return [...set];
}

// Seconds to break each block by hand. Infinity = unbreakable.
export const HARDNESS = {
  [GRASS]: 0.6,
  [DIRT]: 0.6,
  [SAND]: 0.6,
  [SNOW]: 0.4,
  [OAK_LEAVES]: 0.3,
  [OAK_LOG]: 1.5,
  [OAK_PLANKS]: 1.5,
  [GLASS]: 0.4,
  [STONE]: 1.9,
  [COBBLESTONE]: 2.1,
  [BRICK]: 2.1,
  [COAL_ORE]: 2.3,
  [IRON_ORE]: 2.6,
  [GOLD_ORE]: 2.6,
  [DIAMOND_ORE]: 2.9,
  [GLOWSTONE]: 0.5,
  [TORCH]: 0.2,
  [CACTUS]: 0.5,
  [FURNACE]: 3.5,
  [WATER]: Infinity,
  [BEDROCK]: Infinity,
};

export function breakTime(id) {
  const h = HARDNESS[id];
  return h === undefined ? 1.0 : h;
}

export function isBreakable(id) {
  return id !== AIR && breakTime(id) !== Infinity;
}

// What a block yields when mined. AIR means it drops nothing.
export function blockDrop(id) {
  switch (id) {
    case GRASS:
      return DIRT;
    case STONE:
      return COBBLESTONE;
    case OAK_LEAVES:
      return AIR; // leaves drop nothing
    default:
      return id;
  }
}

// Crafting/smelting recipes live in itemdefs.js (they involve item ids too).

export function isOpaque(id) {
  const def = BLOCKS[id];
  return !!(def && def.opaque);
}

export function isSolid(id) {
  const def = BLOCKS[id];
  return !!(def && def.solid);
}

// Default hotbar contents (slot order). Slots are mutable at runtime via the
// creative inventory.
export const HOTBAR = [GRASS, STONE, COBBLESTONE, OAK_PLANKS, OAK_LOG, GLASS, SAND, TORCH, GLOWSTONE];

// Every placeable block, shown in the creative inventory (E). Excludes air.
export const INVENTORY = [
  GRASS,
  DIRT,
  STONE,
  COBBLESTONE,
  OAK_LOG,
  OAK_LEAVES,
  OAK_PLANKS,
  SAND,
  GLASS,
  BRICK,
  SNOW,
  CACTUS,
  TORCH,
  GLOWSTONE,
  FURNACE,
  WATER,
  BEDROCK,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
];
