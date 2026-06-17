// Gravity, input-driven movement and axis-by-axis AABB voxel collision.

import * as THREE from 'three';
import {
  CHUNK_SIZE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  WALK_SPEED,
  SPRINT_SPEED,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  TERMINAL_VELOCITY,
  floorDiv,
} from './constants.js';
import { isSolid } from './blocks.js';

const HALF = PLAYER_WIDTH / 2;
const STEP = 0.05; // collision sub-step (blocks) — small enough to avoid tunnelling
const EPS = 1e-4;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

// Does the player AABB at (x,y,z) (feet position) overlap any solid block?
function aabbCollides(world, x, y, z) {
  const minX = Math.floor(x - HALF);
  const maxX = Math.ceil(x + HALF) - 1;
  const minY = Math.floor(y);
  const maxY = Math.ceil(y + PLAYER_HEIGHT) - 1;
  const minZ = Math.floor(z - HALF);
  const maxZ = Math.ceil(z + HALF) - 1;

  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(world.getBlock(bx, by, bz))) return true;
      }
    }
  }
  return false;
}

// Move along one axis in small steps, reverting the step that first collides.
// Returns true if a collision stopped the motion.
function moveAxis(world, player, axis, disp) {
  if (disp === 0) return false;
  const dir = disp > 0 ? 1 : -1;
  let remaining = Math.abs(disp);
  const pos = player.position;

  while (remaining > 0) {
    const step = Math.min(STEP, remaining) * dir;
    remaining -= Math.abs(step);
    pos[axis] += step;
    if (aabbCollides(world, pos.x, pos.y, pos.z)) {
      pos[axis] -= step;
      return true;
    }
  }
  return false;
}

export function updatePhysics(player, world, dt) {
  const pos = player.position;

  // Don't simulate until every chunk the collision box can touch has been
  // generated, otherwise the player would fall through (or clip into) terrain
  // that hasn't loaded yet near a chunk boundary.
  const cMinX = floorDiv(Math.floor(pos.x - HALF), CHUNK_SIZE);
  const cMaxX = floorDiv(Math.ceil(pos.x + HALF) - 1, CHUNK_SIZE);
  const cMinZ = floorDiv(Math.floor(pos.z - HALF), CHUNK_SIZE);
  const cMaxZ = floorDiv(Math.ceil(pos.z + HALF) - 1, CHUNK_SIZE);
  for (let cx = cMinX; cx <= cMaxX; cx++) {
    for (let cz = cMinZ; cz <= cMaxZ; cz++) {
      if (!world.isLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE)) {
        player.velocity.set(0, 0, 0);
        return;
      }
    }
  }

  const keys = player.keys;
  player.getHorizontalBasis(_fwd, _right);

  const fInput = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const rInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  let wishX = _fwd.x * fInput + _right.x * rInput;
  let wishZ = _fwd.z * fInput + _right.z * rInput;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  if (player.flying) {
    const speed = keys.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;
    player.velocity.x = wishX * speed;
    player.velocity.z = wishZ * speed;
    player.velocity.y = ((keys.jump ? 1 : 0) - (keys.sneak ? 1 : 0)) * speed;
  } else {
    const speed = keys.sprint ? SPRINT_SPEED : WALK_SPEED;
    player.velocity.x = wishX * speed;
    player.velocity.z = wishZ * speed;

    player.velocity.y -= GRAVITY * dt;
    if (player.velocity.y < -TERMINAL_VELOCITY) player.velocity.y = -TERMINAL_VELOCITY;
    if (keys.jump && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
  }

  // Resolve horizontal motion first, then vertical.
  if (moveAxis(world, player, 'x', player.velocity.x * dt)) player.velocity.x = 0;
  if (moveAxis(world, player, 'z', player.velocity.z * dt)) player.velocity.z = 0;
  const hitY = moveAxis(world, player, 'y', player.velocity.y * dt);

  if (hitY) {
    if (player.velocity.y < 0) player.onGround = true;
    player.velocity.y = 0;
  } else if (!player.flying) {
    player.onGround = false;
  }

  // Nudge out of the floor by a hair so onGround stays stable frame to frame.
  if (player.onGround && !player.flying) {
    pos.y += EPS;
  }
}
