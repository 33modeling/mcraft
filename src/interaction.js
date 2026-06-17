// Block interaction: raycast the voxel grid to find the targeted block, and
// break / place blocks. Uses the Amanatides & Woo grid traversal (DDA).

import * as THREE from 'three';
import {
  REACH,
  WORLD_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from './constants.js';
import { AIR, WATER, isSolid } from './blocks.js';

const HALF = PLAYER_WIDTH / 2;

// Reused across frames to avoid per-frame allocations in the hot targeting path.
// Safe because raycastVoxel consumes them synchronously and never retains them.
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

// Cast a ray from `origin` along `dir` (normalized) up to REACH blocks.
// Returns { block:{x,y,z}, place:{x,y,z}, normal:{x,y,z} } or null.
// `block` is the hit voxel; `place` is the empty voxel just before it.
export function raycastVoxel(world, origin, dir) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  // If the eye is already inside a solid block there is no valid adjacent
  // "place" cell and the face normal is undefined, so report no target.
  const startId = world.getBlock(x, y, z);
  if (startId !== AIR && startId !== WATER) return null;

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  // Guard against division by zero for axis-aligned rays.
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  // Distance along the ray to the first grid boundary on each axis.
  const distToBoundary = (o, s) => (s > 0 ? Math.floor(o) + 1 - o : o - Math.floor(o));
  let tMaxX = dir.x !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  while (t <= REACH) {
    const id = world.getBlock(x, y, z);
    if (id !== AIR && id !== WATER) {
      return {
        block: { x, y, z },
        place: { x: x + nx, y: y + ny, z: z + nz },
        normal: { x: nx, y: ny, z: nz },
      };
    }

    // Advance to the next voxel along whichever axis boundary is closest.
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}

// Would a block placed at (bx,by,bz) overlap the player's body? If so we must
// not place it (you can't entomb yourself).
function intersectsPlayer(player, bx, by, bz) {
  const p = player.position;
  const pMinX = p.x - HALF;
  const pMaxX = p.x + HALF;
  const pMinY = p.y;
  const pMaxY = p.y + PLAYER_HEIGHT;
  const pMinZ = p.z - HALF;
  const pMaxZ = p.z + HALF;
  return (
    pMaxX > bx &&
    pMinX < bx + 1 &&
    pMaxY > by &&
    pMinY < by + 1 &&
    pMaxZ > bz &&
    pMinZ < bz + 1
  );
}

// Camera-forward ray used for both targeting and interaction.
function cameraRay(camera) {
  camera.getWorldPosition(_rayOrigin);
  _rayDir.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  return { origin: _rayOrigin, dir: _rayDir };
}

export function getTarget(world, camera) {
  const { origin, dir } = cameraRay(camera);
  return raycastVoxel(world, origin, dir);
}

// Returns true if the world changed (caller should remesh affected chunks).
export function breakBlock(world, camera) {
  const hit = getTarget(world, camera);
  if (!hit) return null;
  const { x, y, z } = hit.block;
  if (world.getBlock(x, y, z) === AIR) return null;
  world.setBlock(x, y, z, AIR);
  return hit.block;
}

export function placeBlock(world, camera, player, blockId) {
  const hit = getTarget(world, camera);
  if (!hit) return null;
  const { x, y, z } = hit.place;
  if (y < 0 || y >= WORLD_HEIGHT) return null;
  const existing = world.getBlock(x, y, z);
  if (existing !== AIR && existing !== WATER) return null; // occupied
  if (intersectsPlayer(player, x, y, z)) return null;
  world.setBlock(x, y, z, blockId);
  return { x, y, z };
}
