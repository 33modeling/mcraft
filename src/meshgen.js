// Pure (THREE-free) chunk geometry generation: face culling + ambient occlusion
// + baked sky/block light. Returns plain arrays so it can run either inline on
// the main thread or inside a Web Worker. The caller turns the arrays into a
// THREE.BufferGeometry (see mesher.js / mesher.worker.js).

import { CHUNK_SIZE, WORLD_HEIGHT } from './constants.js';
import { BLOCKS, AIR, isOpaque, textureForFace } from './blocks.js';
import { computeChunkLight, idxP } from './lighting.js';

const FACES = [
  { n: [1, 0, 0], o: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], facing: 'side', shade: 0.76 },
  { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], facing: 'side', shade: 0.76 },
  { n: [0, 1, 0], o: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], facing: '+y', shade: 1.0 },
  { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], facing: '-y', shade: 0.5 },
  { n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], facing: 'side', shade: 0.88 },
  { n: [0, 0, -1], o: [0, 0, 0], u: [0, 1, 0], v: [1, 0, 0], facing: 'side', shade: 0.88 },
];

const GRID = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const AO_LEVELS = [0.55, 0.72, 0.87, 1.0];

function shouldEmit(id, def, nId) {
  if (nId === AIR) return true;
  const nDef = BLOCKS[nId];
  if (def.transparent) return nDef.transparent && nId !== id;
  return !nDef.opaque;
}

function vertexAO(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

function makeBuffers() {
  return { positions: [], colors: [], uvs: [], lights: [], indices: [], count: 0 };
}

function finalize(buf) {
  return buf.count === 0 ? null : buf;
}

// world: anything exposing getBlock(wx,wy,wz) and getChunk(cx,cz).blocks
// chunk: { cx, cz, get(lx,ly,lz) }
// uvForName: (textureName) -> { x0, y0, x1, y1 }
export function buildChunkArrays(world, chunk, uvForName) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  const opaque = makeBuffers();
  const transparent = makeBuffers();
  const light = computeChunkLight(world, chunk);

  for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, ly, lz);
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (!def.render) continue;

        const wx = baseX + lx;
        const wy = ly;
        const wz = baseZ + lz;
        const buf = def.transparent ? transparent : opaque;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.n[0];
          const ny = wy + face.n[1];
          const nz = wz + face.n[2];
          const nId = world.getBlock(nx, ny, nz);
          if (!shouldEmit(id, def, nId)) continue;

          const uvRect = uvForName(textureForFace(id, face.facing));
          const li = idxP(nx - baseX, ny, nz - baseZ);
          const skyN = light.sky[li] / 15;
          const blkN = light.blk[li] / 15;
          const o = face.o;
          const u = face.u;
          const v = face.v;
          const uVertical = u[1] !== 0;

          const ao = [0, 0, 0, 0];
          for (let c = 0; c < 4; c++) {
            const uo = GRID[c][0];
            const vo = GRID[c][1];
            if (def.transparent) {
              ao[c] = 3;
              continue;
            }
            const su = uo ? 1 : -1;
            const sv = vo ? 1 : -1;
            const s1 = isOpaque(world.getBlock(nx + su * u[0], ny + su * u[1], nz + su * u[2])) ? 1 : 0;
            const s2 = isOpaque(world.getBlock(nx + sv * v[0], ny + sv * v[1], nz + sv * v[2])) ? 1 : 0;
            const cc = isOpaque(
              world.getBlock(nx + su * u[0] + sv * v[0], ny + su * u[1] + sv * v[1], nz + su * u[2] + sv * v[2]),
            )
              ? 1
              : 0;
            ao[c] = vertexAO(s1, s2, cc);
          }

          const start = buf.count;
          for (let c = 0; c < 4; c++) {
            const uo = GRID[c][0];
            const vo = GRID[c][1];
            buf.positions.push(
              lx + o[0] + uo * u[0] + vo * v[0],
              ly + o[1] + uo * u[1] + vo * v[1],
              lz + o[2] + uo * u[2] + vo * v[2],
            );
            let s;
            let t;
            if (face.facing === 'side') {
              t = uVertical ? uo : vo;
              s = uVertical ? vo : uo;
            } else {
              s = uo;
              t = vo;
            }
            buf.uvs.push(uvRect.x0 + s * (uvRect.x1 - uvRect.x0), uvRect.y0 + t * (uvRect.y1 - uvRect.y0));
            const shade = face.shade * AO_LEVELS[ao[c]];
            buf.colors.push(shade, shade, shade);
            buf.lights.push(skyN, blkN);
          }
          buf.count += 4;

          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            buf.indices.push(start + 1, start + 2, start + 3, start + 1, start + 3, start + 0);
          } else {
            buf.indices.push(start + 0, start + 1, start + 2, start + 0, start + 2, start + 3);
          }
        }
      }
    }
  }

  return { opaque: finalize(opaque), transparent: finalize(transparent) };
}
