// ---- Seeded PRNG (mulberry32) ----
function createRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s += 0x6D2B79F5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

// Build a 512-entry doubled permutation table from a seed
function buildPerm(seed) {
  const rand = createRng(seed)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  return perm
}

// ---- Perlin 2D ----
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a, b, t) { return a + t * (b - a) }

function gradP(hash, x, y) {
  switch (hash & 7) {
    case 0: return  x + y
    case 1: return -x + y
    case 2: return  x - y
    case 3: return -x - y
    case 4: return  x
    case 5: return -x
    case 6: return  y
    case 7: return -y
  }
}

function perlin2(x, y, perm) {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  x -= Math.floor(x)
  y -= Math.floor(y)
  const u = fade(x), v = fade(y)
  const a = perm[X]     + Y, b = perm[X + 1] + Y
  return lerp(
    lerp(gradP(perm[a],     x,     y    ), gradP(perm[b],     x - 1, y    ), u),
    lerp(gradP(perm[a + 1], x,     y - 1), gradP(perm[b + 1], x - 1, y - 1), u),
    v
  )
}

// ---- Simplex 2D ----
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

const GRAD2 = [
  [ 1,  2], [-1,  2], [ 1, -2], [-1, -2],
  [ 2,  1], [-2,  1], [ 2, -1], [-2, -1],
]

function simplex2(x, y, perm) {
  const s  = (x + y) * F2
  const i  = Math.floor(x + s)
  const j  = Math.floor(y + s)
  const t  = (i + j) * G2
  const x0 = x - (i - t),  y0 = y - (j - t)
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
  const ii = i & 255, jj = j & 255

  let n = 0
  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 > 0) {
    const g = GRAD2[perm[ii + perm[jj]] % 8]
    t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0)
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 > 0) {
    const g = GRAD2[perm[ii + i1 + perm[jj + j1]] % 8]
    t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1)
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 > 0) {
    const g = GRAD2[perm[ii + 1 + perm[jj + 1]] % 8]
    t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2)
  }
  return 70 * n  // output range roughly [-1, 1]
}

// ---- Apply noise distortion to an array of polylines ----
// Points are in art-space (mm). Displacement is also in mm.
// Two separate noise samples (offset by a large prime) drive X and Y
// independently so they don't look correlated.
export function applyNoiseDistortion(allLines, noiseParams) {
  const { type, seed, scale, multiplier } = noiseParams
  if (type === 'none' || multiplier === 0) return allLines

  const perm   = buildPerm(seed)
  const noiseFn = type === 'simplex' ? simplex2 : perlin2
  const OFFSET  = 31.41  // offset for Y-axis noise sample

  return allLines.map(pts =>
    pts.map(([x, y]) => {
      const nx = noiseFn(x * scale,          y * scale,          perm) * multiplier
      const ny = noiseFn(x * scale + OFFSET,  y * scale + OFFSET, perm) * multiplier
      return [x + nx, y + ny]
    })
  )
}
