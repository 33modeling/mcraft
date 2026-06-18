// Chunk storage and world-space block access.

import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  CHUNK_VOLUME,
  blockIndex,
  chunkKey,
  floorDiv,
  mod,
} from './constants.js';
import { AIR } from './blocks.js';

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOLUME); // all AIR (0) initially
    this.generated = false; // terrain has been filled
    this.dirty = true;       // mesh needs (re)building
    this.meshing = false;    // a worker mesh job is in flight
    this.meshId = 0;         // generation id of the latest enqueued mesh job
    this.opaqueMesh = null;
    this.transparentMesh = null;
  }

  get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[blockIndex(x, y, z)] = id;
  }
}

export class World {
  constructor() {
    this.chunks = new Map(); // "cx,cz" -> Chunk
    // Persistent player edits, kept even after a chunk unloads so they survive
    // regeneration. "cx,cz" -> Map(blockIndex -> blockId).
    this.edits = new Map();
    this._dirtyEdits = false;
  }

  // Re-apply stored player edits over freshly generated terrain.
  applyEdits(chunk) {
    const e = this.edits.get(chunkKey(chunk.cx, chunk.cz));
    if (!e) return;
    for (const [idx, id] of e) chunk.blocks[idx] = id;
  }

  _recordEdit(cx, cz, idx, id) {
    const key = chunkKey(cx, cz);
    let e = this.edits.get(key);
    if (!e) {
      e = new Map();
      this.edits.set(key, e);
    }
    e.set(idx, id);
    this._dirtyEdits = true;
  }

  serializeEdits() {
    const out = [];
    for (const [key, e] of this.edits) {
      out.push([key, Array.from(e)]);
    }
    return out;
  }

  loadEdits(data) {
    if (!Array.isArray(data)) return;
    this.edits = new Map();
    for (const [key, entries] of data) {
      this.edits.set(key, new Map(entries));
    }
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) || null;
  }

  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
    }
    return c;
  }

  removeChunk(cx, cz) {
    this.chunks.delete(chunkKey(cx, cz));
  }

  // World-space block read. Returns AIR for ungenerated/out-of-range space.
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return AIR;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return AIR;
    return chunk.blocks[blockIndex(mod(wx, CHUNK_SIZE), wy, mod(wz, CHUNK_SIZE))];
  }

  // True only when the containing chunk exists and has finished terrain gen.
  // Used by physics so the player never falls through not-yet-loaded ground.
  isLoaded(wx, wz) {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    return !!(chunk && chunk.generated);
  }

  // World-space block write. Marks the owning chunk (and bordering chunks, when
  // the block sits on a chunk edge) dirty so their meshes rebuild.
  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    const lx = mod(wx, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);
    const idx = blockIndex(lx, wy, lz);
    chunk.blocks[idx] = id;
    chunk.dirty = true;
    this._recordEdit(cx, cz, idx, id);

    // Edge writes change a neighbour's visible border faces too.
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  // Are all four horizontal neighbours generated? The mesher needs them so it
  // can correctly cull (or keep) faces on chunk borders.
  neighborsReady(cx, cz) {
    return (
      this.isChunkGenerated(cx - 1, cz) &&
      this.isChunkGenerated(cx + 1, cz) &&
      this.isChunkGenerated(cx, cz - 1) &&
      this.isChunkGenerated(cx, cz + 1)
    );
  }

  isChunkGenerated(cx, cz) {
    const c = this.getChunk(cx, cz);
    return !!(c && c.generated);
  }
}
