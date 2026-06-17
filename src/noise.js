// Deterministic, seedable noise utilities (Perlin gradient noise + helpers).

// Fast seedable PRNG. Returns a function producing floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash -> float in [0, 1). Useful for per-voxel deterministic choices.
export function hash3(x, y, z, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + (seed | 0) * 1274126177;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export class Noise {
  constructor(seed = 0) {
    const rand = mulberry32(seed || 1);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle of the permutation table.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint16Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  static fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  static lerp(a, b, t) {
    return a + t * (b - a);
  }

  static grad2(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return (h & 1 ? -u : u) + (h & 2 ? -2 * v : 2 * v);
  }

  static grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  }

  // Improved Perlin noise in 3D. Output roughly in [-1, 1].
  perlin3D(x, y, z) {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Noise.fade(x);
    const v = Noise.fade(y);
    const w = Noise.fade(z);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return Noise.lerp(
      Noise.lerp(
        Noise.lerp(Noise.grad3(p[AA], x, y, z), Noise.grad3(p[BA], x - 1, y, z), u),
        Noise.lerp(Noise.grad3(p[AB], x, y - 1, z), Noise.grad3(p[BB], x - 1, y - 1, z), u),
        v,
      ),
      Noise.lerp(
        Noise.lerp(Noise.grad3(p[AA + 1], x, y, z - 1), Noise.grad3(p[BA + 1], x - 1, y, z - 1), u),
        Noise.lerp(Noise.grad3(p[AB + 1], x, y - 1, z - 1), Noise.grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  // Improved Perlin noise in 2D. Output roughly in [-1, 1].
  perlin2D(x, y) {
    const perm = this.perm;
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = Noise.fade(xf);
    const v = Noise.fade(yf);

    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];

    const x1 = Noise.lerp(Noise.grad2(aa, xf, yf), Noise.grad2(ba, xf - 1, yf), u);
    const x2 = Noise.lerp(Noise.grad2(ab, xf, yf - 1), Noise.grad2(bb, xf - 1, yf - 1), u);
    return Noise.lerp(x1, x2, v);
  }

  // Fractal Brownian motion: layered octaves of perlin2D, normalized to ~[-1, 1].
  fbm2D(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
