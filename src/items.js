// Dropped entities: block drops render as little spinning cubes, item drops as
// flat camera-facing sprites. The player walks over them to collect (survival).

import * as THREE from 'three';
import { textureForFace, isSolid } from './blocks.js';
import { isItem, stackTexture } from './itemdefs.js';

const FACES = ['side', 'side', '+y', '-y', 'side', 'side'];

function blockGeometry(atlas, blockId) {
  const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = atlas.uvForName(textureForFace(blockId, FACES[f]));
    const i = f * 4;
    uv.setXY(i + 0, r.x0, r.y1);
    uv.setXY(i + 1, r.x1, r.y1);
    uv.setXY(i + 2, r.x0, r.y0);
    uv.setXY(i + 3, r.x1, r.y0);
  }
  uv.needsUpdate = true;
  return geo;
}

function itemGeometry(atlas, stackId) {
  const geo = new THREE.PlaneGeometry(0.4, 0.4);
  const r = atlas.uvForName(stackTexture(stackId));
  const uv = geo.attributes.uv;
  uv.setXY(0, r.x0, r.y1);
  uv.setXY(1, r.x1, r.y1);
  uv.setXY(2, r.x0, r.y0);
  uv.setXY(3, r.x1, r.y0);
  uv.needsUpdate = true;
  return geo;
}

export class DroppedItems {
  constructor(scene, atlas, world) {
    this.scene = scene;
    this.atlas = atlas;
    this.world = world;
    this.items = [];
    this.blockMat = new THREE.MeshBasicMaterial({ map: atlas.texture });
    this.itemMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
  }

  spawn(stackId, x, y, z) {
    const item = isItem(stackId);
    const geo = item ? itemGeometry(this.atlas, stackId) : blockGeometry(this.atlas, stackId);
    const mesh = new THREE.Mesh(geo, item ? this.itemMat : this.blockMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.items.push({
      mesh,
      geo,
      stackId,
      item,
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.0, (Math.random() - 0.5) * 1.5),
      age: 0,
    });
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      it.geo.dispose();
    }
    this.items.length = 0;
  }

  update(dt, player, camera, onPickup) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const p = it.mesh.position;

      it.vel.y -= 18 * dt;
      p.x += it.vel.x * dt;
      p.z += it.vel.z * dt;
      it.vel.x *= 0.9;
      it.vel.z *= 0.9;

      let ny = p.y + it.vel.y * dt;
      const groundY = Math.floor(ny - 0.15);
      if (isSolid(this.world.getBlock(Math.floor(p.x), groundY, Math.floor(p.z)))) {
        ny = groundY + 1 + 0.16;
        it.vel.y = 0;
      }
      p.y = ny;

      if (it.item) it.mesh.quaternion.copy(camera.quaternion); // billboard sprites
      else it.mesh.rotation.y += dt * 1.6;

      if (it.age > 0.5) {
        const dx = p.x - player.position.x;
        const dy = p.y - (player.position.y + 0.9);
        const dz = p.z - player.position.z;
        if (dx * dx + dy * dy + dz * dz < 1.7) {
          onPickup(it.stackId);
          this.scene.remove(it.mesh);
          it.geo.dispose();
          this.items.splice(i, 1);
          continue;
        }
      }
      if (it.age > 300) {
        this.scene.remove(it.mesh);
        it.geo.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
