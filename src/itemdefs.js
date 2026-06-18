// Item registry — things that are NOT blocks: tools, food and materials.
//
// Stack ids share one space with blocks: 0..255 are blocks (see blocks.js),
// ITEM_BASE.. are items. Inventory counts are keyed by stack id, so the same
// map holds both. Helpers here classify a stack id and expose item properties.

import {
  BLOCKS,
  AIR,
  STONE,
  COBBLESTONE,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
  BRICK,
  GLOWSTONE,
  OAK_LOG,
  OAK_PLANKS,
  OAK_LEAVES,
  GLASS,
  TORCH,
  FURNACE,
  DIRT,
  GRASS,
  SAND,
  SNOW,
  textureForFace,
} from './blocks.js';

export const ITEM_BASE = 256;

export const STICK = 256;
export const COAL = 257;
export const IRON_INGOT = 258;
export const APPLE = 259;
export const RAW_BEEF = 260;
export const COOKED_BEEF = 261;
export const RAW_CHICKEN = 262;
export const COOKED_CHICKEN = 263;
export const LEATHER = 264;
export const FEATHER = 265;
export const BONE = 266;
export const ARROW = 267;

export const WOOD_PICKAXE = 268;
export const WOOD_AXE = 269;
export const WOOD_SHOVEL = 270;
export const WOOD_SWORD = 271;
export const STONE_PICKAXE = 272;
export const STONE_AXE = 273;
export const STONE_SHOVEL = 274;
export const STONE_SWORD = 275;
export const IRON_PICKAXE = 276;
export const IRON_AXE = 277;
export const IRON_SHOVEL = 278;
export const IRON_SWORD = 279;

const TIER_SPEED = { wood: 2, stone: 4, iron: 6 };
const TIER_LEVEL = { wood: 1, stone: 2, iron: 3 };
const TIER_DURA = { wood: 60, stone: 132, iron: 251 };
const TIER_ATTACK = { wood: 4, stone: 5, iron: 6 };

function tool(name, kind, tier) {
  return {
    name,
    texture: `item_${tier}_${kind}`,
    type: 'tool',
    kind, // pickaxe | axe | shovel | sword
    tier,
    level: TIER_LEVEL[tier],
    speed: TIER_SPEED[tier],
    durability: TIER_DURA[tier],
    attack: kind === 'sword' ? TIER_ATTACK[tier] : 2,
  };
}

function food(name, texture, hunger) {
  return { name, texture, type: 'food', hunger };
}

function material(name, texture) {
  return { name, texture, type: 'material' };
}

export const ITEMS = {
  [STICK]: material('Stick', 'item_stick'),
  [COAL]: material('Coal', 'item_coal'),
  [IRON_INGOT]: material('Iron Ingot', 'item_iron_ingot'),
  [LEATHER]: material('Leather', 'item_leather'),
  [FEATHER]: material('Feather', 'item_feather'),
  [BONE]: material('Bone', 'item_bone'),
  [ARROW]: material('Arrow', 'item_arrow'),
  [APPLE]: food('Apple', 'item_apple', 4),
  [RAW_BEEF]: food('Raw Beef', 'item_raw_beef', 3),
  [COOKED_BEEF]: food('Steak', 'item_cooked_beef', 8),
  [RAW_CHICKEN]: food('Raw Chicken', 'item_raw_chicken', 2),
  [COOKED_CHICKEN]: food('Cooked Chicken', 'item_cooked_chicken', 6),
  [WOOD_PICKAXE]: tool('Wooden Pickaxe', 'pickaxe', 'wood'),
  [WOOD_AXE]: tool('Wooden Axe', 'axe', 'wood'),
  [WOOD_SHOVEL]: tool('Wooden Shovel', 'shovel', 'wood'),
  [WOOD_SWORD]: tool('Wooden Sword', 'sword', 'wood'),
  [STONE_PICKAXE]: tool('Stone Pickaxe', 'pickaxe', 'stone'),
  [STONE_AXE]: tool('Stone Axe', 'axe', 'stone'),
  [STONE_SHOVEL]: tool('Stone Shovel', 'shovel', 'stone'),
  [STONE_SWORD]: tool('Stone Sword', 'sword', 'stone'),
  [IRON_PICKAXE]: tool('Iron Pickaxe', 'pickaxe', 'iron'),
  [IRON_AXE]: tool('Iron Axe', 'axe', 'iron'),
  [IRON_SHOVEL]: tool('Iron Shovel', 'shovel', 'iron'),
  [IRON_SWORD]: tool('Iron Sword', 'sword', 'iron'),
};

export function isItem(id) {
  return id >= ITEM_BASE;
}

export function isBlockStack(id) {
  return id > AIR && id < ITEM_BASE && !!BLOCKS[id];
}

// Can this stack be placed as a block?
export function isPlaceable(id) {
  return isBlockStack(id) && BLOCKS[id].render;
}

export function stackName(id) {
  if (isItem(id)) return ITEMS[id] ? ITEMS[id].name : 'Item ' + id;
  return BLOCKS[id] ? BLOCKS[id].name : 'Block ' + id;
}

// Atlas texture name used for a stack's icon.
export function stackTexture(id) {
  if (isItem(id)) return ITEMS[id] ? ITEMS[id].texture : 'item_stick';
  return textureForFace(id, 'side');
}

export function itemDef(id) {
  return ITEMS[id] || null;
}

export function isTool(id) {
  return isItem(id) && ITEMS[id] && ITEMS[id].type === 'tool';
}

export function foodValue(id) {
  const it = ITEMS[id];
  return it && it.type === 'food' ? it.hunger : 0;
}

// Which tool kind speeds up mining each block, and whether a drop needs it.
const PICK = new Set([STONE, COBBLESTONE, COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, BRICK, GLOWSTONE]);
const AXE = new Set([OAK_LOG, OAK_PLANKS]);
const SHOVEL = new Set([DIRT, GRASS, SAND, SNOW]);

function toolKindFor(blockId) {
  if (PICK.has(blockId)) return 'pickaxe';
  if (AXE.has(blockId)) return 'axe';
  if (SHOVEL.has(blockId)) return 'shovel';
  return null;
}

// Mining speed multiplier for using `stackId` on `blockId`.
export function miningSpeed(stackId, blockId) {
  if (!isTool(stackId)) return 1;
  const t = ITEMS[stackId];
  if (t.kind === toolKindFor(blockId)) return t.speed;
  return 1;
}

// Blocks that require a pickaxe (and a minimum tier) to yield a drop.
const NEEDS_PICK = new Set([STONE, COBBLESTONE, COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, BRICK, GLOWSTONE]);
function minTier(blockId) {
  if (blockId === IRON_ORE) return 2; // stone+
  if (blockId === GOLD_ORE || blockId === DIAMOND_ORE) return 3; // iron+
  return 1; // wood+
}

// Does the held stack qualify to harvest a drop from this block?
export function canHarvest(stackId, blockId) {
  if (!NEEDS_PICK.has(blockId)) return true; // dirt/wood/etc. always drop
  if (!isTool(stackId)) return false;
  const t = ITEMS[stackId];
  return t.kind === 'pickaxe' && t.level >= minTier(blockId);
}

// Every item texture name (for the atlas builder).
export function allItemTextureNames() {
  const set = new Set();
  for (const id in ITEMS) set.add(ITEMS[id].texture);
  return [...set];
}

// Items shown in the creative inventory, in display order.
export const ITEM_INVENTORY = [
  WOOD_PICKAXE, WOOD_AXE, WOOD_SHOVEL, WOOD_SWORD,
  STONE_PICKAXE, STONE_AXE, STONE_SHOVEL, STONE_SWORD,
  IRON_PICKAXE, IRON_AXE, IRON_SHOVEL, IRON_SWORD,
  STICK, COAL, IRON_INGOT, LEATHER, FEATHER, BONE, ARROW,
  APPLE, RAW_BEEF, COOKED_BEEF, RAW_CHICKEN, COOKED_CHICKEN,
];

// What a mined block yields as a stack (item or block). AIR = nothing.
// Leaves are handled separately by the caller (apple chance).
export function dropFor(blockId) {
  switch (blockId) {
    case COAL_ORE:
      return COAL;
    case STONE:
      return COBBLESTONE;
    case GRASS:
      return DIRT;
    case OAK_LEAVES:
      return AIR;
    default:
      return blockId; // wood, sand, iron/gold/diamond ore as blocks, etc.
  }
}

// Crafting + smelting recipes. "Smelting" recipes simply include COAL as fuel,
// so the same consume-inputs/produce-output machinery handles both.
function tr(kind, tier, planks) {
  const map = { pickaxe: 3, axe: 3, shovel: 1, sword: 2 };
  const sticks = kind === 'sword' ? 1 : 2;
  const toolId = { wood: WOOD_PICKAXE, stone: STONE_PICKAXE, iron: IRON_PICKAXE }[tier]
    + ['pickaxe', 'axe', 'shovel', 'sword'].indexOf(kind);
  return { in: [{ id: planks, n: map[kind] }, { id: STICK, n: sticks }], out: { id: toolId, n: 1 }, name: ITEMS[toolId].name };
}

export const RECIPES = [
  { in: [{ id: OAK_LOG, n: 1 }], out: { id: OAK_PLANKS, n: 4 }, name: 'Oak Planks' },
  { in: [{ id: OAK_PLANKS, n: 2 }], out: { id: STICK, n: 4 }, name: 'Sticks' },
  { in: [{ id: COAL, n: 1 }, { id: OAK_PLANKS, n: 1 }], out: { id: TORCH, n: 4 }, name: 'Torch' },
  { in: [{ id: COBBLESTONE, n: 8 }], out: { id: FURNACE, n: 1 }, name: 'Furnace' },
  tr('pickaxe', 'wood', OAK_PLANKS),
  tr('axe', 'wood', OAK_PLANKS),
  tr('shovel', 'wood', OAK_PLANKS),
  tr('sword', 'wood', OAK_PLANKS),
  tr('pickaxe', 'stone', COBBLESTONE),
  tr('axe', 'stone', COBBLESTONE),
  tr('shovel', 'stone', COBBLESTONE),
  tr('sword', 'stone', COBBLESTONE),
  tr('pickaxe', 'iron', IRON_INGOT),
  tr('axe', 'iron', IRON_INGOT),
  tr('shovel', 'iron', IRON_INGOT),
  tr('sword', 'iron', IRON_INGOT),
  // Smelting (consume 1 coal as fuel).
  { in: [{ id: IRON_ORE, n: 1 }, { id: COAL, n: 1 }], out: { id: IRON_INGOT, n: 1 }, name: 'Smelt Iron' },
  { in: [{ id: SAND, n: 1 }, { id: COAL, n: 1 }], out: { id: GLASS, n: 1 }, name: 'Smelt Glass' },
  { in: [{ id: RAW_BEEF, n: 1 }, { id: COAL, n: 1 }], out: { id: COOKED_BEEF, n: 1 }, name: 'Cook Steak' },
  { in: [{ id: RAW_CHICKEN, n: 1 }, { id: COAL, n: 1 }], out: { id: COOKED_CHICKEN, n: 1 }, name: 'Cook Chicken' },
];
