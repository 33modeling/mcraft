// Mobs: passive animals (pig, cow, sheep, chicken) and hostiles (zombie melee,
// skeleton ranged, creeper exploding). Blocky box models with gravity, auto-hop
// collision, leg-swing animation, simple AI, damage-triggered health bars, item
// drops on death, and an arrow projectile system for skeletons.

import * as THREE from 'three';
import { AIR, WATER, GRASS, isSolid } from './blocks.js';
import { RAW_BEEF, RAW_CHICKEN, LEATHER, FEATHER, BONE, ARROW } from './itemdefs.js';

const TYPES = {
  PIG: {
    color: 0xe69aa0, head: 0xe07f86, leg: 0xcf7f86,
    bodyW: 0.7, bodyH: 0.7, bodyL: 1.1, headS: 0.55, legH: 0.4,
    height: 0.9, speed: 2.2, hostile: false, upright: false, maxHealth: 10,
    drops: [{ id: RAW_BEEF, min: 1, max: 2 }],
  },
  COW: {
    color: 0x6b4a2f, head: 0x5a3a22, leg: 0x4a3320,
    bodyW: 0.8, bodyH: 0.85, bodyL: 1.2, headS: 0.55, legH: 0.55,
    height: 1.3, speed: 1.8, hostile: false, upright: false, maxHealth: 10,
    drops: [{ id: RAW_BEEF, min: 1, max: 2 }, { id: LEATHER, min: 0, max: 2 }],
  },
  SHEEP: {
    color: 0xeeeee8, head: 0xd8c4a8, leg: 0xd8c4a8,
    bodyW: 0.8, bodyH: 0.8, bodyL: 1.1, headS: 0.5, legH: 0.5,
    height: 1.1, speed: 2.0, hostile: false, upright: false, maxHealth: 10,
    drops: [],
  },
  CHICKEN: {
    color: 0xeeeeee, head: 0xe8e8e8, leg: 0xddaa44,
    bodyW: 0.4, bodyH: 0.4, bodyL: 0.5, headS: 0.3, legH: 0.25,
    height: 0.6, speed: 2.1, hostile: false, upright: false, maxHealth: 6,
    drops: [{ id: RAW_CHICKEN, min: 1, max: 1 }, { id: FEATHER, min: 0, max: 2 }],
  },
  ZOMBIE: {
    color: 0x3f7d46, head: 0x5fa15f, leg: 0x32506e,
    bodyW: 0.6, bodyH: 0.85, bodyL: 0.35, headS: 0.5, legH: 0.65,
    height: 1.85, speed: 2.7, hostile: true, upright: true, maxHealth: 20,
    detect: 20, damage: 3, attackCd: 1.0, burns: true, drops: [],
  },
  SKELETON: {
    color: 0xcfcfcf, head: 0xe2e2e2, leg: 0xa8a8a8,
    bodyW: 0.6, bodyH: 0.85, bodyL: 0.35, headS: 0.5, legH: 0.65,
    height: 1.85, speed: 2.4, hostile: true, upright: true, maxHealth: 16,
    detect: 22, damage: 2, attackCd: 1.4, burns: true, ranged: true,
    drops: [{ id: BONE, min: 0, max: 2 }, { id: ARROW, min: 0, max: 2 }],
  },
  CREEPER: {
    color: 0x4caa4c, head: 0x57b657, leg: 0x3c8a3c,
    bodyW: 0.6, bodyH: 1.1, bodyL: 0.4, headS: 0.5, legH: 0.3,
    height: 1.6, speed: 3.0, hostile: true, upright: true, maxHealth: 20,
    detect: 16, explode: true, drops: [],
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
    geo.translate(0, -t.legH / 2, 0);
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

  // Health bar (hidden until damaged).
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }),
  );
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x36c43a, depthTest: false }),
  );
  barFg.position.z = 0.001;
  const bar = new THREE.Group();
  bar.add(barBg);
  bar.add(barFg);
  bar.position.set(0, t.legH + t.bodyH + (t.upright ? t.headS + 0.25 : 0.4), 0);
  bar.visible = false;
  bar.renderOrder = 997;
  group.add(bar);

  return { group, legs, bar, barFg, body, head };
}

class Mob {
  constructor(typeName, x, y, z) {
    const t = TYPES[typeName];
    this.type = typeName;
    this.t = t;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.kbx = 0;
    this.kbz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.height = t.height;
    this.hostile = t.hostile;
    this.maxHealth = t.maxHealth;
    this.health = t.maxHealth;
    this.attackTimer = 0;
    this.shootTimer = 1 + Math.random();
    this.fuse = -1; // creeper fuse (>=0 once primed)
    this.wTimer = 0;
    this.wYaw = this.yaw;
    this.wWalk = false;
    this.phase = 0;
    this.moving = false;
    const model = buildModel(t);
    this.group = model.group;
    this.legs = model.legs;
    this.bar = model.bar;
    this.barFg = model.barFg;
    this.body = model.body;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
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
    const t = this.t;

    if (this.hostile) {
      const dx = player.position.x - this.x;
      const dz = player.position.z - this.z;
      const dist = Math.hypot(dx, dz);
      const aware = dist < t.detect && (t.explode || ctx.daylight < 0.55);

      if (t.explode) {
        // Creeper: approach, then prime a fuse and detonate.
        if (aware) {
          this.yaw = Math.atan2(dx, dz);
          if (dist > 1.8) {
            this.vx = (dx / dist) * t.speed;
            this.vz = (dz / dist) * t.speed;
            this.moving = true;
            this.fuse = -1;
          } else {
            this.vx = this.vz = 0;
            this.moving = false;
            this.fuse = this.fuse < 0 ? 0 : this.fuse + dt;
            const flash = 1 + Math.sin(this.fuse * 25) * 0.12;
            this.body.scale.set(flash, flash, flash);
            if (this.fuse >= 1.5) {
              ctx.explode(this.x, this.y + 0.5, this.z, 3);
              this.health = 0; // consumed by the blast
            }
          }
        } else {
          this.fuse = -1;
          this.body.scale.set(1, 1, 1);
          this._wander(dt);
        }
      } else if (t.ranged) {
        // Skeleton: keep distance and shoot arrows.
        if (aware) {
          this.yaw = Math.atan2(dx, dz);
          this.moving = true;
          if (dist < 6) {
            this.vx = -(dx / dist) * t.speed;
            this.vz = -(dz / dist) * t.speed;
          } else if (dist > 10) {
            this.vx = (dx / dist) * t.speed;
            this.vz = (dz / dist) * t.speed;
          } else {
            this.vx = this.vz = 0;
            this.moving = false;
          }
          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            this.shootTimer = t.attackCd + 0.6;
            ctx.shootArrow(this.x, this.y + 1.3, this.z, player);
          }
        } else {
          this._wander(dt);
        }
      } else {
        // Zombie: chase and melee.
        if (aware) {
          this.yaw = Math.atan2(dx, dz);
          this.vx = (dx / dist) * t.speed;
          this.vz = (dz / dist) * t.speed;
          this.moving = true;
          if (dist < 1.5 && this.attackTimer <= 0) {
            ctx.damagePlayer(t.damage);
            this.attackTimer = t.attackCd;
          }
        } else {
          this._wander(dt);
        }
      }
      if (t.burns && ctx.daylight > 0.85) this.health -= dt * 2.5;
    } else {
      this._wander(dt);
    }

    this._physics(dt, world);

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

    // Health bar: visible when hurt, billboarded, scaled to remaining health.
    if (this.health < this.maxHealth && this.health > 0) {
      this.bar.visible = true;
      const frac = Math.max(0, this.health / this.maxHealth);
      this.barFg.scale.x = frac;
      this.barFg.position.x = -(1 - frac) * 0.39;
      this.barFg.material.color.setHSL(frac * 0.33, 0.8, 0.45);
      this.bar.quaternion.copy(ctx.camera.quaternion);
    } else {
      this.bar.visible = false;
    }
  }

  _physics(dt, world) {
    this.vy -= 26 * dt;
    if (this.vy < -28) this.vy = -28;

    this._tryHoriz(world, 'x', (this.vx + this.kbx) * dt);
    this._tryHoriz(world, 'z', (this.vz + this.kbz) * dt);
    const kd = Math.max(0, 1 - dt * 6);
    this.kbx *= kd;
    this.kbz *= kd;

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
    const r = 0.35;
    const solidAt = (yOff) => {
      for (const o of [-r, r]) {
        const bx = Math.floor(axis === 'x' ? this.x + s * r : this.x + o);
        const bz = Math.floor(axis === 'z' ? this.z + s * r : this.z + o);
        if (isSolid(world.getBlock(bx, Math.floor(this.y + yOff), bz))) return true;
      }
      return false;
    };
    const feet = solidAt(0.2);
    const chest = solidAt(1.0);
    if (feet || chest) {
      const clearAbove = !solidAt(this.height + 0.2);
      if (this.onGround && !chest && clearAbove) this.vy = 7.5;
      return;
    }
    if (axis === 'x') this.x += d;
    else this.z += d;
  }
}

// Skeleton arrow projectile.
class Arrow {
  constructor(scene, x, y, z, vx, vy, vz) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.age = 0;
    this.geo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x999999 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    scene.add(this.mesh);
  }
  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.arrows = [];
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

  shootArrow(x, y, z, player) {
    const dx = player.position.x - x;
    const dy = player.position.y + 1.0 - y;
    const dz = player.position.z - z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const speed = 22;
    this.arrows.push(new Arrow(this.scene, x, y, z, (dx / d) * speed, (dy / d) * speed + 1.5, (dz / d) * speed));
  }

  clear() {
    for (const m of this.list) {
      this.scene.remove(m.group);
      m.dispose();
    }
    this.list.length = 0;
    for (const a of this.arrows) a.dispose(this.scene);
    this.arrows.length = 0;
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
      if (night && hostile < 12) {
        const roll = Math.random();
        const kind = roll < 0.5 ? 'ZOMBIE' : roll < 0.8 ? 'SKELETON' : 'CREEPER';
        this.spawn(kind, x + 0.5, sy + 1, z + 0.5);
        hostile++;
      } else if (!night && passive < 10 && top === GRASS) {
        const roll = Math.random();
        const kind = roll < 0.3 ? 'PIG' : roll < 0.6 ? 'COW' : roll < 0.8 ? 'SHEEP' : 'CHICKEN';
        this.spawn(kind, x + 0.5, sy + 1, z + 0.5);
        passive++;
      }
    }
  }

  update(dt, player, ctx) {
    ctx.shootArrow = (x, y, z, p) => this.shootArrow(x, y, z, p);
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
        if (m.health <= 0 && m.y >= -20) {
          for (const d of m.t.drops || []) {
            const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
            for (let j = 0; j < n; j++) ctx.spawnDrop(d.id, m.x, m.y + 0.4, m.z);
          }
        }
        this.scene.remove(m.group);
        m.dispose();
        this.list.splice(i, 1);
      }
    }

    this._updateArrows(dt, player, ctx);
  }

  _updateArrows(dt, player, ctx) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      a.vy -= 9 * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);

      const hitBlock = isSolid(this.world.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)));
      const dx = a.x - player.position.x;
      const dy = a.y - (player.position.y + 0.9);
      const dz = a.z - player.position.z;
      const hitPlayer = dx * dx + dy * dy + dz * dz < 0.5;
      if (hitPlayer) ctx.damagePlayer(2);
      if (hitBlock || hitPlayer || a.age > 5) {
        a.dispose(this.scene);
        this.arrows.splice(i, 1);
      }
    }
  }

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
    best.kbx = ((best.x - origin.x) / kd) * 8;
    best.kbz = ((best.z - origin.z) / kd) * 8;
    best.vy = 4;
    return true;
  }
}
