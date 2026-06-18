// THREE wrapper around the pure geometry generator (meshgen.js). Provides the
// synchronous fallback path and converts plain/typed arrays into a
// THREE.BufferGeometry that the renderer can use.

import * as THREE from 'three';
import { buildChunkArrays } from './meshgen.js';

export function arraysToGeometry(buf) {
  if (!buf) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
  geo.setAttribute('light', new THREE.Float32BufferAttribute(buf.lights, 2));
  const idx = buf.indices;
  if (idx instanceof Uint32Array || idx instanceof Uint16Array) {
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  } else {
    geo.setIndex(idx);
  }
  return geo;
}

// Synchronous fallback (used when no Web Worker is available).
export function buildChunkGeometry(world, chunk, atlas) {
  const { opaque, transparent } = buildChunkArrays(world, chunk, atlas.uvForName);
  return { opaque: arraysToGeometry(opaque), transparent: arraysToGeometry(transparent) };
}
