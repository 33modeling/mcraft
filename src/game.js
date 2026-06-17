// Top-level game: renderer, scene, chunk streaming around the player, the main
// loop, and all DOM input wiring.

import * as THREE from 'three';
import {
  CHUNK_SIZE,
  RENDER_DISTANCE,
  WORLD_SEED,
  SEA_LEVEL,
  PLAYER_EYE,
  floorDiv,
  chunkKey,
} from './constants.js';
import { Noise } from './noise.js';
import { World } from './world.js';
import { generateChunk, surfaceInfo } from './worldgen.js';
import { buildChunkGeometry } from './mesher.js';
import { buildTextureAtlas, buildCrackTextures } from './textures.js';
import { Player } from './player.js';
import { updatePhysics } from './physics.js';
import { getTarget, placeBlock } from './interaction.js';
import { UI } from './ui.js';
import { Sky } from './sky.js';
import { BLOCKS, AIR, WATER, textureForFace, breakTime, isBreakable } from './blocks.js';

const GEN_PER_FRAME = 6;
const MESH_PER_FRAME = 3;
const DAY_LENGTH = 300; // seconds for a full day/night cycle

const DAY_SKY = new THREE.Color(0x8fc4ff);
const NIGHT_SKY = new THREE.Color(0x0a1026);
const DUSK_SKY = new THREE.Color(0xffa24d);

export class Game {
  constructor(container) {
    this.container = container;
    this.locked = false;
    this.inventoryOpen = false;
    this.debugVisible = false;
    this.lastTime = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this._initRenderer();
    this._initScene();

    this.atlas = buildTextureAtlas();
    this.crackTextures = buildCrackTextures();
    this.mining = { active: false, key: null, progress: 0 };
    this._saveTimer = null;
    this.timeOfDay = 0.3; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset

    this.daylightUniform = { value: 1 };
    this.opaqueMat = new THREE.MeshBasicMaterial({ map: this.atlas.texture, vertexColors: true });
    this.transparentMat = new THREE.MeshBasicMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this._applyLighting(this.opaqueMat);
    this._applyLighting(this.transparentMat);
    // Held-block viewmodel uses the atlas at full brightness (no vertex colors).
    this.viewMat = new THREE.MeshBasicMaterial({ map: this.atlas.texture });

    this.noise = new Noise(WORLD_SEED);
    this.world = new World();
    this._loadWorld();
    this.player = new Player(this.camera);
    this.ui = new UI(this.atlas);
    this.debugEl = document.getElementById('debug');

    this._particles = [];
    this._audioCtx = null;

    this.sky = new Sky(this.scene);
    this._initHighlight();
    this._initCrackOverlay();
    this._initViewModel();
    this._initWaterOverlay();
    this._spawnPlayer();
    this._pregenSpawn();

    this.player.initControls(this.renderer.domElement);
    this._initInput();
    this._onResize();
    window.addEventListener('resize', () => this._onResize());

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // Sky and fog colours are updated every frame by the day/night cycle.
    this.skyColor = new THREE.Color(0x8fc4ff);
    this.scene.background = this.skyColor;
    const far = (RENDER_DISTANCE - 0.5) * CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(this.skyColor.clone(), far * 0.5, far);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
  }

  // Inject sky/block light into a MeshBasicMaterial. Geometry carries a `light`
  // (sky, block) vertex attribute; uDaylight scales the sky contribution.
  _applyLighting(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDaylight = this.daylightUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 light;\nvarying vec2 vLight;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = light;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vLight;\nuniform float uDaylight;',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n{ float bSky = pow(vLight.x, 1.35) * uDaylight; float bBlk = pow(vLight.y, 1.4); float bright = max(max(bSky, bBlk), 0.05); diffuseColor.rgb *= bright; }',
        );
    };
    material.needsUpdate = true;
  }

  _updateDayNight(dt) {
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
    const sunHeight = Math.sin((this.timeOfDay - 0.25) * Math.PI * 2);

    // Daylight factor: bright by day, dim moonlight at night.
    const daylight = Math.min(1, Math.max(0.12, sunHeight * 0.9 + 0.35));
    this.daylightUniform.value = daylight;

    // Sky colour: night -> day, tinted orange near the horizon (dawn/dusk).
    const dayAmt = Math.min(1, Math.max(0, (sunHeight + 0.15) / 0.35));
    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayAmt);
    const duskAmt = Math.max(0, 1 - Math.abs(sunHeight) / 0.22) * Math.max(0, Math.min(1, sunHeight + 0.5));
    this.skyColor.lerp(DUSK_SKY, duskAmt * 0.5);
    this.scene.fog.color.copy(this.skyColor);

    this.sky.update(this.timeOfDay, daylight, this.camera.position, dt);
  }

  _initHighlight() {
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(box);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  _initCrackOverlay() {
    const geo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.crackMat = new THREE.MeshBasicMaterial({
      map: this.crackTextures[0],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.crackMesh = new THREE.Mesh(geo, this.crackMat);
    this.crackMesh.visible = false;
    this.crackMesh.renderOrder = 998;
    this.scene.add(this.crackMesh);
  }

  _loadWorld() {
    try {
      const raw = localStorage.getItem('mcraft.world.' + WORLD_SEED);
      if (raw) this.world.loadEdits(JSON.parse(raw));
    } catch (e) {
      /* ignore corrupt/over-quota storage */
    }
  }

  _saveWorld() {
    try {
      localStorage.setItem('mcraft.world.' + WORLD_SEED, JSON.stringify(this.world.serializeEdits()));
      this.world._dirtyEdits = false;
    } catch (e) {
      /* ignore over-quota storage */
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveWorld(), 700);
  }

  _stopMining() {
    this.mining.active = false;
    this.mining.key = null;
    this.mining.progress = 0;
    if (this.crackMesh) this.crackMesh.visible = false;
  }

  // Hold-to-break: accumulate progress on the targeted block, show the crack
  // overlay, and break it once enough time has passed for its hardness.
  _updateMining(dt) {
    if (!this.mining.active || !this.locked) {
      if (this.crackMesh.visible) this.crackMesh.visible = false;
      return;
    }
    const hit = this._lookingAt;
    if (!hit) {
      this.mining.key = null;
      this.mining.progress = 0;
      this.crackMesh.visible = false;
      return;
    }
    const b = hit.block;
    const id = this.world.getBlock(b.x, b.y, b.z);
    if (!isBreakable(id)) {
      this.crackMesh.visible = false;
      this.mining.progress = 0;
      this.mining.key = null;
      return;
    }
    const key = b.x + ',' + b.y + ',' + b.z;
    if (key !== this.mining.key) {
      this.mining.key = key;
      this.mining.progress = 0;
    }
    this.mining.progress += dt;
    const total = breakTime(id);
    const stage = Math.min(9, Math.floor((this.mining.progress / total) * 10));
    this.crackMesh.visible = true;
    this.crackMesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    if (this.crackMat.map !== this.crackTextures[stage]) {
      this.crackMat.map = this.crackTextures[stage];
      this.crackMat.needsUpdate = true;
    }
    if (this.mining.progress >= total) {
      this.world.setBlock(b.x, b.y, b.z, AIR);
      this._remeshAround(b);
      this._spawnBreakParticles(b, id);
      this._playSound(0.16, 0.08);
      this.mining.progress = 0;
      this.mining.key = null;
      this.crackMesh.visible = false;
      this._scheduleSave();
    }
  }

  // First-person held block. Added to the scene and repositioned relative to the
  // camera each frame (the camera itself is never added to the scene graph).
  _initViewModel() {
    this._vmGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    this._vmMesh = new THREE.Mesh(this._vmGeo, this.viewMat);
    this._vmMesh.frustumCulled = false;
    this._vmMesh.renderOrder = 999;
    this._vmBlock = -1; // force first UV build
    this.scene.add(this._vmMesh);
  }

  _updateViewModel() {
    const block = this.ui.getSelectedBlock();
    if (block !== this._vmBlock) {
      this._vmBlock = block;
      // Rewrite each box face's UVs to that block's atlas tile.
      // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 verts each).
      const uvAttr = this._vmGeo.attributes.uv;
      const faces = ['side', 'side', '+y', '-y', 'side', 'side'];
      for (let f = 0; f < 6; f++) {
        const r = this.atlas.uvForName(textureForFace(block, faces[f]));
        const i = f * 4;
        uvAttr.setXY(i + 0, r.x0, r.y1);
        uvAttr.setXY(i + 1, r.x1, r.y1);
        uvAttr.setXY(i + 2, r.x0, r.y0);
        uvAttr.setXY(i + 3, r.x1, r.y0);
      }
      uvAttr.needsUpdate = true;
    }
    const offset = new THREE.Vector3(0.42, -0.36, -0.62).applyQuaternion(this.camera.quaternion);
    this._vmMesh.position.copy(this.camera.position).add(offset);
    this._vmMesh.quaternion.copy(this.camera.quaternion);
    this._vmMesh.rotateY(Math.PI / 6);
    this._vmMesh.rotateX(-Math.PI / 12);
  }

  _initWaterOverlay() {
    this.waterOverlay = document.createElement('div');
    Object.assign(this.waterOverlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background: 'rgba(48, 96, 190, 0.32)',
      display: 'none',
      zIndex: '4',
    });
    this.container.appendChild(this.waterOverlay);
  }

  // Small particle burst at a broken block, coloured by that block's texture.
  _spawnBreakParticles(b, blockId) {
    const N = 12;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = b.x + 0.2 + Math.random() * 0.6;
      pos[i * 3 + 1] = b.y + 0.2 + Math.random() * 0.6;
      pos[i * 3 + 2] = b.z + 0.2 + Math.random() * 0.6;
      vel.push(
        new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3),
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rgb = this.atlas.sampleColor(textureForFace(blockId, 'side'));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255),
      size: 0.14,
      sizeAttenuation: true,
      transparent: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this._particles.push({ pts, vel, life: 0.55, max: 0.55, geo, mat });
  }

  _updateParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      const arr = p.geo.attributes.position.array;
      for (let j = 0; j < p.vel.length; j++) {
        p.vel[j].y -= 12 * dt;
        arr[j * 3] += p.vel[j].x * dt;
        arr[j * 3 + 1] += p.vel[j].y * dt;
        arr[j * 3 + 2] += p.vel[j].z * dt;
      }
      p.geo.attributes.position.needsUpdate = true;
      p.mat.opacity = Math.max(0, p.life / p.max);
      if (p.life <= 0) {
        this.scene.remove(p.pts);
        p.geo.dispose();
        p.mat.dispose();
        this._particles.splice(i, 1);
      }
    }
  }

  // Short procedural noise burst — no audio asset needed.
  _playSound(gain, duration) {
    try {
      if (!this._audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this._audioCtx = new AC();
      }
      const ctx = this._audioCtx;
      const len = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(ctx.destination);
      src.start();
    } catch (e) {
      /* audio is best-effort */
    }
  }

  // Find a sensible above-water spawn near the origin.
  _spawnPlayer() {
    let best = { x: 8, z: 8, h: surfaceInfo(this.noise, 8, 8).height };
    if (best.h <= SEA_LEVEL) {
      outer: for (let r = 1; r < 80; r++) {
        for (let a = 0; a < r * 8; a++) {
          const ang = (a / (r * 8)) * Math.PI * 2;
          const x = Math.round(8 + Math.cos(ang) * r);
          const z = Math.round(8 + Math.sin(ang) * r);
          const h = surfaceInfo(this.noise, x, z).height;
          if (h > SEA_LEVEL) {
            best = { x, z, h };
            break outer;
          }
        }
      }
    }
    this.player.position.set(best.x + 0.5, best.h + 2, best.z + 0.5);
  }

  _pregenSpawn() {
    const pcx = floorDiv(this.player.position.x, CHUNK_SIZE);
    const pcz = floorDiv(this.player.position.z, CHUNK_SIZE);
    const R = 3;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const c = this.world.ensureChunk(pcx + dx, pcz + dz);
        if (!c.generated) generateChunk(this.world, c, this.noise);
      }
    }
    // Mesh the inner ring now so the world is visible on the first frame.
    for (let dx = -R + 1; dx <= R - 1; dx++) {
      for (let dz = -R + 1; dz <= R - 1; dz++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (c && c.dirty && this.world.neighborsReady(pcx + dx, pcz + dz)) this._meshChunk(c);
      }
    }
  }

  _initInput() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', () => {
      if (this.inventoryOpen) {
        this._setInventory(false);
        return;
      }
      if (!this.locked) canvas.requestPointerLock();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mining.active = true; // hold to break
      } else if (e.button === 2) {
        const changed = placeBlock(this.world, this.camera, this.player, this.ui.getSelectedBlock());
        if (changed) {
          this._remeshAround(changed);
          this._playSound(0.12, 0.06);
          this._scheduleSave();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._stopMining();
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('pagehide', () => this._saveWorld());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this._saveWorld();
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        this.ui.cycle(e.deltaY > 0 ? 1 : -1);
        e.preventDefault();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Digit')) {
        if (e.ctrlKey || e.metaKey || e.altKey) return; // don't hijack browser tab shortcuts
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.ui.selectSlot(n - 1);
      } else if (e.code === 'KeyE') {
        this._setInventory(!this.inventoryOpen);
      } else if (e.code === 'F3') {
        this.debugVisible = !this.debugVisible;
        if (this.debugEl) this.debugEl.classList.toggle('hidden', !this.debugVisible);
        e.preventDefault();
      } else if (e.code === 'Escape' && this.inventoryOpen) {
        this._setInventory(false);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      // If the lock was granted while the inventory flag was still set (the user
      // pressed E during the async request window), close it so state can't desync.
      if (this.locked && this.inventoryOpen) {
        this.inventoryOpen = false;
        this.ui.setInventoryOpen(false);
      }
      if (!this.locked) this._stopMining();
      this._refreshOverlays();
    });
  }

  _setInventory(open) {
    this.inventoryOpen = open;
    this.ui.setInventoryOpen(open);
    if (open && this.locked) document.exitPointerLock();
    else if (!open && !this.locked) this.renderer.domElement.requestPointerLock();
    this._refreshOverlays();
  }

  _refreshOverlays() {
    const instr = document.getElementById('instructions');
    if (instr) instr.classList.toggle('hidden', this.locked || this.inventoryOpen);
    this.ui.setInventoryOpen(this.inventoryOpen && !this.locked);
  }

  _meshChunk(chunk) {
    const { opaque, transparent } = buildChunkGeometry(this.world, chunk, this.atlas);
    this._swapMesh(chunk, 'opaqueMesh', opaque, this.opaqueMat);
    this._swapMesh(chunk, 'transparentMesh', transparent, this.transparentMat);
    chunk.dirty = false;
  }

  _swapMesh(chunk, slot, geometry, material) {
    if (chunk[slot]) {
      this.scene.remove(chunk[slot]);
      chunk[slot].geometry.dispose();
      chunk[slot] = null;
    }
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk[slot] = mesh;
    }
  }

  _meshIfReady(cx, cz) {
    const c = this.world.getChunk(cx, cz);
    if (c && c.generated && c.dirty && this.world.neighborsReady(cx, cz)) this._meshChunk(c);
  }

  // After an edit, rebuild the affected chunk and any neighbour it touched.
  _remeshAround(pos) {
    const cx = floorDiv(pos.x, CHUNK_SIZE);
    const cz = floorDiv(pos.z, CHUNK_SIZE);
    this._meshIfReady(cx, cz);
    this._meshIfReady(cx - 1, cz);
    this._meshIfReady(cx + 1, cz);
    this._meshIfReady(cx, cz - 1);
    this._meshIfReady(cx, cz + 1);
  }

  _updateChunks() {
    const pcx = floorDiv(this.player.position.x, CHUNK_SIZE);
    const pcz = floorDiv(this.player.position.z, CHUNK_SIZE);
    const R = RENDER_DISTANCE;
    const genR = R + 1;

    const cands = [];
    for (let dx = -genR; dx <= genR; dx++) {
      for (let dz = -genR; dz <= genR; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > genR * genR) continue;
        cands.push({ cx: pcx + dx, cz: pcz + dz, d2 });
      }
    }
    cands.sort((a, b) => a.d2 - b.d2);

    let genBudget = GEN_PER_FRAME;
    for (const c of cands) {
      const chunk = this.world.ensureChunk(c.cx, c.cz);
      if (!chunk.generated) {
        generateChunk(this.world, chunk, this.noise);
        if (--genBudget <= 0) break;
      }
    }

    let meshBudget = MESH_PER_FRAME;
    for (const c of cands) {
      if (c.d2 > R * R) continue;
      const chunk = this.world.getChunk(c.cx, c.cz);
      if (chunk && chunk.generated && chunk.dirty && this.world.neighborsReady(c.cx, c.cz)) {
        this._meshChunk(chunk);
        if (--meshBudget <= 0) break;
      }
    }

    // Unload chunks well outside the render distance.
    const unloadR = R + 2;
    for (const chunk of this.world.chunks.values()) {
      if (Math.abs(chunk.cx - pcx) > unloadR || Math.abs(chunk.cz - pcz) > unloadR) {
        this._swapMesh(chunk, 'opaqueMesh', null, null);
        this._swapMesh(chunk, 'transparentMesh', null, null);
        this.world.chunks.delete(chunkKey(chunk.cx, chunk.cz));
      }
    }
  }

  _updateHighlight() {
    const hit = getTarget(this.world, this.camera);
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
      this._lookingAt = hit;
    } else {
      this.highlight.visible = false;
      this._lookingAt = null;
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(dt) || dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    if (this.locked) updatePhysics(this.player, this.world, dt);
    this.player.updateCamera();

    this._updateChunks();
    this._updateHighlight();
    this._updateMining(dt);
    this._updateViewModel();
    this._updateParticles(dt);

    // Underwater tint when the eyes are inside a water block.
    const ex = Math.floor(this.player.position.x);
    const ey = Math.floor(this.player.position.y + PLAYER_EYE);
    const ez = Math.floor(this.player.position.z);
    const submerged = this.world.getBlock(ex, ey, ez) === WATER;
    this.waterOverlay.style.display = submerged ? 'block' : 'none';

    this._updateDayNight(dt);

    // FPS, averaged over ~0.5s.
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    let looking = null;
    if (this._lookingAt) {
      const b = this._lookingAt.block;
      const id = this.world.getBlock(b.x, b.y, b.z);
      const def = BLOCKS[id];
      looking = `${def ? def.name : id} (${b.x}, ${b.y}, ${b.z})`;
    }
    this.ui.updateDebug({
      fps: this.fps,
      position: this.player.position,
      yaw: this.player.yaw,
      chunkX: floorDiv(this.player.position.x, CHUNK_SIZE),
      chunkZ: floorDiv(this.player.position.z, CHUNK_SIZE),
      loadedChunks: this.world.chunks.size,
      flying: this.player.flying,
      onGround: this.player.onGround,
      time: this.timeOfDay,
      looking,
    });

    this.renderer.render(this.scene, this.camera);
  }
}
