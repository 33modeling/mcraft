// Simple mobs: passive animals (pig, sheep) that wander and a hostile zombie
// that hunts the player at night. Mobs are blocky box models with basic gravity,
// auto-hopping collision, leg-swing animation, and lightweight AI.

import * as THREE from 'three';
import { AIR, WATER, GRASS, isSolid } from './blocks.js';

const TYPES = {
  PIG: {
    color: 0xe69aa0, head: 0xe07f86, leg: 0xcf7f86,
    bodyW: 0.7, bodyH: 0.7, bodyL: 1.1, headS: 0.55, legH: 0.4,
    height: 0.9, speed: 2.2, hostile: false, upright: false, maxHealth: 10,
  },
  SHEEP: {
    color: 0xeeeee8, head: 0xd8c4a8, leg: 0xd8c4a8,
    bodyW: 0.8, bodyH: 0.8, bodyL: 1.1, headS: 0.5, legH: 0.5,
    height: 1.1, speed: 2.0, hostile: false, upright: false, maxHealth: 10,
  },
  ZOMBIE: {
    color: 0x3f7d46, head: 0x5fa15f, leg: 0x32506e,
    bodyW: 0.6, bodyH: 0.85, bodyL: 0.35, headS: 0.5, legH: 0.65,
    height: 1.85, speed: 2.7, hostile: true, upright: true, maxHealth: 20,
    detect: 20, damage: 3, attackCd: 1.0,
  },
};

function buildModel(t) {
  const group = new THREE.Group();
  const mk = (c) => new THREE.MeshBasicMaterial({ color: c });
  const bodyMat = mk(t.color);
  const headMat = mk(t.head);
  const legMat = mk(t.leg);

  const legs = [];
  const leg = (px, pz) => {
    const geo = new THREE.BoxGeometry(0.18, t.legH, 0.18);
    geo.translate(0, -t.legH / 2, 0); // pivot at the hip
    const m = new THREE.Mesh(geo, legMat);
    m.position.set(px, t.legH, pz);
    group.add(m);
    legs.push(m);
  };
  const hw = t.bodyW / 2 - 0.09;
  const hl = t.bodyL / 2 - 0.09;
  leg(hw, hl);
  leg(-hw, hl);
  leg(hw, -hl);
  leg(-hw, -hl);

  const body = new THREE.Mesh(new THREE.BoxGeometry(t.bodyW, t.bodyH, t.bodyL), bodyMat);
  body.position.set(0, t.legH + t.bodyH / 2, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(t.headS, t.headS, t.headS), headMat);
  if (t.upright) head.position.set(0, t.legH + t.bodyH + t.headS / 2, 0);
  else head.position.set(0, t.legH + t.bodyH - t.headS * 0.2, t.bodyL / 2 + t.headS * 0.2);
  group.add(head);

  return { group, legs };
}

class Mob {
  constructor(typeName, x, y, z) {
    this.type = typeName;
    const t = TYPES[typeName];
    this.t = t;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.height = t.height;
    this.hostile = t.hostile;
    this.health = t.maxHealth;
    this.attackTimer = 0;
    this.wTimer = 0;
    this.wYaw = this.yaw;
    this.wWalk = false;
    this.phase = 0;
    this.moving = false;
    const model = buildModel(t);
    this.group = model.group;
    this.legs = model.legs;
  }

  _wander(dt) {
    this.wTimer -= dt;
    if (this.wTimer <= 0) {
      this.wTimer = 2 + Math.random() * 3;
      this.wYaw = Math.random() * Math.PI * 2;
      this.wWalk = Math.random() < 0.6;
    }
    if (this.wWalk) {
      this.vx = Math.sin(this.wYaw) * this.t.speed * 0.5;
      this.vz = Math.cos(this.wYaw) * this.t.speed * 0.5;
      this.yaw = this.wYaw;
      this.moving = true;
    } else {
      this.vx = 0;
      this.vz = 0;
      this.moving = false;
    }
  }

  update(dt, world, player, ctx) {
    this.attackTimer -= dt;

    if (this.hostile) {
      const dx = player.position.x - this.x;
      const dz = player.position.z - this.z;
      const dist = Math.hypot(dx, dz);
      const canSee = dist < this.t.detect && ctx.daylight < 0.55;
      if (canSee) {
        this.yaw = Math.atan2(dx, dz);
        this.vx = (dx / dist) * this.t.speed;
        this.vz = (dz / dist) * this.t.speed;
        this.moving = true;
        if (dist < 1.5 && this.attackTimer <= 0) {
          ctx.damagePlayer(this.t.damage);
          this.attackTimer = this.t.attackCd;
        }
      } else {
        this._wander(dt);
      }
      if (ctx.daylight > 0.85) this.health -= dt * 2.5; // burns in daylight
    } else {
      this._wander(dt);
    }

    this._physics(dt, world);

    // Animation.
    if (this.moving) this.phase += dt * 7;
    const swing = this.moving ? Math.sin(this.phase) * 0.5 : 0;
    if (this.legs.length === 4) {
      this.legs[0].rotation.x = swing;
      this.legs[3].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
      this.legs[2].rotation.x = -swing;
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
  }

  _physics(dt, world) {
    this.vy -= 26 * dt;
    if (this.vy < -28) this.vy = -28;

    this._tryHoriz(world, 'x', this.vx * dt);
    this._tryHoriz(world, 'z', this.vz * dt);

    let ny = this.y + this.vy * dt;
    this.onGround = false;
    if (this.vy <= 0) {
      const by = Math.floor(ny - 0.02);
      if (isSolid(world.getBlock(Math.floor(this.x), by, Math.floor(this.z)))) {
        ny = by + 1;
        this.vy = 0;
        this.onGround = true;
      }
    } else {
      const hy = Math.floor(ny + this.height);
      if (isSolid(world.getBlock(Math.floor(this.x), hy, Math.floor(this.z)))) {
        this.vy = 0;
        ny = this.y;
      }
    }
    this.y = ny;
  }

  _tryHoriz(world, axis, d) {
    if (d === 0) return;
    const s = Math.sign(d);
    const bx = Math.floor(axis === 'x' ? this.x + s * 0.35 : this.x);
    const bz = Math.floor(axis === 'z' ? this.z + s * 0.35 : this.z);
    const feet = isSolid(world.getBlock(bx, Math.floor(this.y + 0.2), bz));
    const chest = isSolid(world.getBlock(bx, Math.floor(this.y + 1.0), bz));
    if (feet || chest) {
      // Hop over a one-block obstacle if grounded and there is headroom.
      const clearAbove = !isSolid(world.getBlock(bx, Math.floor(this.y + this.height + 0.2), bz));
      if (this.onGround && !chest && clearAbove) this.vy = 7.5;
      return;
    }
    if (axis === 'x') this.x += d;
    else this.z += d;
  }
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this._spawnTimer = 0;
  }

  get count() {
    return this.list.length;
  }

  spawn(typeName, x, y, z) {
    const mob = new Mob(typeName, x, y, z);
    this.scene.add(mob.group);
    this.list.push(mob);
    return mob;
  }

  clear() {
    for (const m of this.list) this.scene.remove(m.group);
    this.list.length = 0;
  }

  _spawnAttempt(player, daylight) {
    const night = daylight < 0.4;
    let passive = 0;
    let hostile = 0;
    for (const m of this.list) m.hostile ? hostile++ : passive++;

    for (let k = 0; k < 4; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 18;
      const x = Math.round(player.position.x + Math.cos(ang) * r);
      const z = Math.round(player.position.z + Math.sin(ang) * r);
      let sy = null;
      for (let y = 112; y > 1; y--) {
        const id = this.world.getBlock(x, y, z);
        if (id !== AIR && id !== WATER) {
          sy = y;
          break;
        }
      }
      if (sy === null) continue;
      if (this.world.getBlock(x, sy + 1, z) !== AIR || this.world.getBlock(x, sy + 2, z) !== AIR) continue;
      const top = this.world.getBlock(x, sy, z);
      if (night && hostile < 10) {
        this.spawn('ZOMBIE', x + 0.5, sy + 1, z + 0.5);
        hostile++;
      } else if (!night && passive < 8 && top === GRASS) {
        this.spawn(Math.random() < 0.5 ? 'PIG' : 'SHEEP', x + 0.5, sy + 1, z + 0.5);
        passive++;
      }
    }
  }

  update(dt, player, ctx) {
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = 2;
      this._spawnAttempt(player, ctx.daylight);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.update(dt, this.world, player, ctx);
      const far = Math.hypot(m.x - player.position.x, m.z - player.position.z) > 72;
      if (m.health <= 0 || m.y < -20 || far) {
        this.scene.remove(m.group);
        this.list.splice(i, 1);
      }
    }
  }

  // Melee the mob the camera is looking at, within reach. Returns true on a hit.
  meleeHit(camera, reach, damage) {
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    let best = null;
    let bestDist = reach;
    for (const m of this.list) {
      const cx = m.x - origin.x;
      const cy = m.y + m.height * 0.5 - origin.y;
      const cz = m.z - origin.z;
      const dist = Math.hypot(cx, cy, cz);
      if (dist > reach || dist < 0.001) continue;
      const dot = (cx * dir.x + cy * dir.y + cz * dir.z) / dist;
      if (dot > 0.93 && dist < bestDist) {
        best = m;
        bestDist = dist;
      }
    }
    if (!best) return false;
    best.health -= damage;
    const kd = Math.hypot(best.x - origin.x, best.z - origin.z) || 1;
    best.vx += ((best.x - origin.x) / kd) * 4;
    best.vz += ((best.z - origin.z) / kd) * 4;
    best.vy = 4;
    return true;
  }
}
