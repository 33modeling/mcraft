// Procedurally generated texture atlas. Every block texture is painted into a
// 16x16 tile on a single canvas, then uploaded as one THREE texture. No external
// image assets are needed, so the game runs from a bare static file server.

import * as THREE from 'three';
import { allTextureNames } from './blocks.js';
import { mulberry32 } from './noise.js';

const TILE = 16; // pixels per texture tile
const COLS = 8;  // tiles per atlas row

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

// Seed a PRNG deterministically from a texture name so tiles never change.
function seedFromName(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Each painter fills a Uint8ClampedArray (RGBA, 16x16) given a seeded rand.
function px(data, x, y, r, g, b, a = 255) {
  const i = (y * TILE + x) * 4;
  data[i] = clamp8(r);
  data[i + 1] = clamp8(g);
  data[i + 2] = clamp8(b);
  data[i + 3] = clamp8(a);
}

// Fill the whole tile with a base colour plus per-pixel brightness noise.
function speckle(data, rand, base, variance, alpha = 255) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = (rand() - 0.5) * 2 * variance;
      px(data, x, y, base[0] + v, base[1] + v, base[2] + v, alpha);
    }
  }
}

function oreSpecks(data, rand, color) {
  // Scatter a few small clusters of ore over a stone base.
  const clusters = 4 + Math.floor(rand() * 3);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(rand() * 12);
    const cy = 2 + Math.floor(rand() * 12);
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const x = clamp8(cx + Math.floor((rand() - 0.5) * 4));
      const y = clamp8(cy + Math.floor((rand() - 0.5) * 4));
      if (x < 0 || x >= TILE || y < 0 || y >= TILE) continue;
      const v = (rand() - 0.5) * 30;
      px(data, x, y, color[0] + v, color[1] + v, color[2] + v);
    }
  }
}

const PAINTERS = {
  dirt(d, rand) {
    speckle(d, rand, [132, 94, 66], 24);
    // darker weathered clumps for variation
    for (let c = 0; c < 5; c++) {
      const cx = Math.floor(rand() * TILE);
      const cy = Math.floor(rand() * TILE);
      const n = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const x = clamp8(cx + Math.floor((rand() - 0.5) * 3));
        const y = clamp8(cy + Math.floor((rand() - 0.5) * 3));
        if (x < TILE && y < TILE) px(d, x, y, 92, 64, 42);
      }
    }
  },
  grass_top(d, rand) {
    speckle(d, rand, [92, 156, 58], 18);
    // a few brighter blades
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      px(d, x, y, 110 + rand() * 30, 180 + rand() * 30, 70 + rand() * 20);
    }
  },
  grass_side(d, rand) {
    speckle(d, rand, [132, 94, 66], 16);
    // green soil cap with a ragged lower edge
    for (let x = 0; x < TILE; x++) {
      const edge = 3 + Math.floor(rand() * 2);
      for (let y = 0; y < edge; y++) {
        const v = (rand() - 0.5) * 24;
        px(d, x, y, 92 + v, 156 + v, 58 + v);
      }
      if (rand() < 0.5) {
        const v = (rand() - 0.5) * 24;
        px(d, x, edge, 92 + v, 156 + v, 58 + v);
      }
    }
  },
  stone(d, rand) {
    speckle(d, rand, [126, 126, 126], 12);
    // wandering cracks with a darker shadow pixel underneath for depth
    for (let i = 0; i < 7; i++) {
      let x = Math.floor(rand() * TILE);
      let y = Math.floor(rand() * TILE);
      const len = 8 + Math.floor(rand() * 5); // 8..12
      for (let k = 0; k < len; k++) {
        const cx = clamp8(x);
        const cy = clamp8(y);
        if (cx < TILE && cy < TILE) {
          px(d, cx, cy, 96, 96, 96);
          if (cy + 1 < TILE && rand() < 0.6) px(d, cx, cy + 1, 78, 78, 78);
        }
        x += rand() < 0.5 ? 1 : rand() < 0.5 ? -1 : 0;
        y += rand() < 0.5 ? 1 : -1; // cracks can now move up as well as down
      }
    }
  },
  cobblestone(d, rand) {
    speckle(d, rand, [120, 120, 120], 10);
    // dark mortar grid forming rough cobbles
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const gx = x % 8;
        const gy = y % 8;
        if (gx === 0 || gy === 0 || ((x % 16 < 8) !== (y % 16 < 8) && (gx === 4 || gy === 4))) {
          const v = (rand() - 0.5) * 10;
          px(d, x, y, 70 + v, 70 + v, 70 + v);
        }
      }
    }
  },
  log_top(d, rand) {
    speckle(d, rand, [160, 124, 78], 10);
    const cx = 7.5;
    const cy = 7.5;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (Math.floor(dist) % 3 === 0) {
          const v = (rand() - 0.5) * 8;
          px(d, x, y, 120 + v, 88 + v, 52 + v);
        }
      }
    }
  },
  log_side(d, rand) {
    speckle(d, rand, [104, 78, 46], 12);
    // vertical bark streaks
    for (let x = 0; x < TILE; x++) {
      if (rand() < 0.4) {
        for (let y = 0; y < TILE; y++) {
          const v = (rand() - 0.5) * 14;
          px(d, x, y, 78 + v, 56 + v, 32 + v);
        }
      }
    }
  },
  leaves(d, rand) {
    speckle(d, rand, [56, 118, 40], 26);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      if (rand() < 0.5) px(d, x, y, 36, 86, 28);
      else px(d, x, y, 86, 150, 58);
    }
  },
  planks(d, rand) {
    speckle(d, rand, [176, 140, 86], 10);
    for (let y = 0; y < TILE; y++) {
      if (y % 4 === 0) {
        for (let x = 0; x < TILE; x++) px(d, x, y, 130, 100, 60);
      }
    }
    // vertical seams offset between plank rows
    for (let y = 0; y < TILE; y++) {
      const seam = (Math.floor(y / 4) % 2) * 8 + 7;
      px(d, seam, y, 130, 100, 60);
    }
  },
  sand(d, rand) {
    speckle(d, rand, [219, 207, 158], 12);
  },
  glass(d, rand) {
    // mostly see-through, with a light frame
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const border = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (border) px(d, x, y, 196, 220, 228, 235);
        else if ((x === 1 || y === 1) && rand() < 0.3) px(d, x, y, 220, 240, 245, 120);
        else px(d, x, y, 210, 232, 240, 38);
      }
    }
  },
  water(d, rand) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const wave = Math.sin((x + y) * 0.6) * 8;
        const v = (rand() - 0.5) * 10 + wave;
        px(d, x, y, 50 + v, 110 + v, 200 + v, 205);
      }
    }
  },
  bedrock(d, rand) {
    speckle(d, rand, [78, 78, 80], 18);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      px(d, x, y, rand() < 0.5 ? 30 : 120, rand() < 0.5 ? 30 : 120, 34);
    }
  },
  coal_ore(d, rand) {
    PAINTERS.stone(d, rand);
    oreSpecks(d, rand, [38, 38, 38]);
  },
  iron_ore(d, rand) {
    PAINTERS.stone(d, rand);
    oreSpecks(d, rand, [196, 152, 116]);
  },
  gold_ore(d, rand) {
    PAINTERS.stone(d, rand);
    oreSpecks(d, rand, [236, 206, 92]);
  },
  diamond_ore(d, rand) {
    PAINTERS.stone(d, rand);
    oreSpecks(d, rand, [104, 224, 224]);
  },
  brick(d, rand) {
    speckle(d, rand, [164, 74, 58], 10);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const row = Math.floor(y / 4);
        const offset = (row % 2) * 4;
        if (y % 4 === 0 || (x + offset) % 8 === 0) px(d, x, y, 198, 192, 178); // mortar
      }
    }
  },
  snow(d, rand) {
    speckle(d, rand, [246, 248, 252], 6);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      px(d, x, y, 220, 228, 240);
    }
  },
};

export function buildTextureAtlas() {
  const names = allTextureNames();
  const rows = Math.ceil(names.length / COLS);
  const W = COLS * TILE;
  const H = rows * TILE;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const tiles = new Map(); // name -> { col, row }
  names.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    tiles.set(name, { col, row });

    const img = ctx.createImageData(TILE, TILE);
    const painter = PAINTERS[name];
    const rand = mulberry32(seedFromName(name));
    if (painter) painter(img.data, rand);
    else speckle(img.data, rand, [200, 80, 200], 20); // magenta = missing texture
    ctx.putImageData(img, col * TILE, row * TILE);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const inset = 0.5; // half-texel inset to stop neighbouring tiles bleeding in
  const uvCache = new Map();
  function uvForName(name) {
    let r = uvCache.get(name);
    if (r) return r;
    const t = tiles.get(name) || { col: 0, row: 0 };
    const x0 = (t.col * TILE + inset) / W;
    const x1 = ((t.col + 1) * TILE - inset) / W;
    // CanvasTexture has flipY = true: canvas row 0 (top) maps to v near 1.
    const y1 = 1 - (t.row * TILE + inset) / H; // top edge in UV space
    const y0 = 1 - ((t.row + 1) * TILE - inset) / H; // bottom edge
    r = { x0, y0, x1, y1 };
    uvCache.set(name, r);
    return r;
  }

  // Draw a single tile scaled up onto a fresh canvas (used for hotbar icons).
  function iconCanvas(name, size) {
    const t = tiles.get(name) || { col: 0, row: 0 };
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, t.col * TILE, t.row * TILE, TILE, TILE, 0, 0, size, size);
    return out;
  }

  // Representative colour of a tile (centre pixel) — used for break particles.
  function sampleColor(name) {
    const t = tiles.get(name) || { col: 0, row: 0 };
    const d = ctx.getImageData(t.col * TILE + (TILE >> 1), t.row * TILE + (TILE >> 1), 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  return { texture, uvForName, iconCanvas, canvas, sampleColor };
}

// Ten progressive crack overlays (destroy_stage_0..9) for the mining animation.
// Returns an array of THREE.CanvasTexture with transparent backgrounds.
export function buildCrackTextures() {
  const out = [];
  for (let stage = 0; stage < 10; stage++) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    const rand = mulberry32(1234 + stage * 97);
    const cracks = 1 + stage; // more cracks as the block nears breaking
    for (let i = 0; i < cracks; i++) {
      let x = Math.floor(rand() * TILE);
      let y = Math.floor(rand() * TILE);
      const len = 4 + Math.floor(rand() * 8);
      for (let k = 0; k < len; k++) {
        if (x >= 0 && x < TILE && y >= 0 && y < TILE) {
          px(img.data, x, y, 12, 12, 12, 200);
        }
        x += rand() < 0.5 ? 1 : rand() < 0.5 ? -1 : 0;
        y += rand() < 0.5 ? 1 : -1;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    out.push(tex);
  }
  return out;
}
