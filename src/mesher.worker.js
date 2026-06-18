// Web Worker: builds chunk geometry off the main thread. It reuses the same
// pure modules (World/Chunk, meshgen, lighting) the main thread uses, so the
// output is byte-for-byte identical to the synchronous path.

import { World } from './world.js';
import { buildChunkArrays } from './meshgen.js';

let uvRects = null;
const uvForName = (name) => uvRects[name] || { x0: 0, y0: 0, x1: 1, y1: 1 };

function pack(buf) {
  if (!buf) return null;
  return {
    positions: new Float32Array(buf.positions),
    colors: new Float32Array(buf.colors),
    uvs: new Float32Array(buf.uvs),
    lights: new Float32Array(buf.lights),
    indices: new Uint32Array(buf.indices),
  };
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    uvRects = msg.uvRects;
    return;
  }
  if (msg.type !== 'mesh' || !uvRects) return;

  const { key, cx, cz, neighbors } = msg;
  const world = new World();
  let center = null;
  for (const n of neighbors) {
    const c = world.ensureChunk(cx + n.dx, cz + n.dz);
    c.blocks = n.blocks; // adopt the transferred/cloned array
    c.generated = true;
    if (n.dx === 0 && n.dz === 0) center = c;
  }
  if (!center) {
    self.postMessage({ key, opaque: null, transparent: null });
    return;
  }

  const { opaque, transparent } = buildChunkArrays(world, center, uvForName);
  const o = pack(opaque);
  const t = pack(transparent);
  const transfer = [];
  for (const p of [o, t]) {
    if (p) transfer.push(p.positions.buffer, p.colors.buffer, p.uvs.buffer, p.lights.buffer, p.indices.buffer);
  }
  self.postMessage({ key, opaque: o, transparent: t }, transfer);
};
