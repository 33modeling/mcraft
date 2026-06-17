// Celestial bodies and clouds. The sun and moon orbit on a sky dome relative to
// the camera; a scrolling cloud plane sits above the world. Colours and the
// day/night daylight factor are driven by game.js.

import * as THREE from 'three';

function discTexture(coreColor, edgeColor, soft) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, coreColor);
  g.addColorStop(soft, edgeColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  // a handful of soft rounded blobs, drawn wrapped so the texture tiles
  let seed = 987654321 >>> 0;
  const rnd = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 22; i++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = 8 + rnd() * 18;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        ctx.beginPath();
        ctx.arc(cx + dx * S, cy + dz * S, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene) {
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: discTexture('rgba(255,250,230,1)', 'rgba(255,230,150,0.9)', 0.5),
        fog: false,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.sun.scale.set(60, 60, 1);
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: discTexture('rgba(230,235,245,1)', 'rgba(180,190,210,0.8)', 0.55),
        fog: false,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.moon.scale.set(46, 46, 1);
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    cloudGeo.rotateX(-Math.PI / 2);
    this.clouds = new THREE.Mesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({
        map: cloudTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.8,
      }),
    );
    this.clouds.scale.set(2400, 1, 2400);
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    this._cloudOffset = 0;
  }

  update(timeOfDay, daylight, camPos, dt) {
    const a = (timeOfDay - 0.25) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.28).normalize();

    this.sun.position.copy(camPos).addScaledVector(dir, 380);
    this.sun.visible = dir.y > -0.15;
    this.moon.position.copy(camPos).addScaledVector(dir, -380);
    this.moon.visible = dir.y < 0.15;

    this.clouds.position.set(camPos.x, 122, camPos.z);
    this._cloudOffset += dt * 0.004;
    const map = this.clouds.material.map;
    map.offset.x = this._cloudOffset;
    map.offset.y = this._cloudOffset * 0.4;
    this.clouds.material.opacity = 0.25 + daylight * 0.55;
    this.clouds.material.color.setScalar(0.45 + daylight * 0.55);
  }
}
