/**
 * Illustrative rocks, pure (no three.js). Real rocks this small cannot be seen from orbit, so these are
 * drawn from a rock-abundance curve (constants in constants.ts, a TEAM ASSUMPTION) with a random
 * generator seeded by the cell: the same place always shows the same rocks.
 */

/** Small fast seeded generator, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed for one grid cell. */
export function cellSeed(row: number, col: number, worldSeed: number): number {
  let h = Math.imul(row + 0x9e37, 0x85ebca6b) ^ Math.imul(col + 0x7f4a, 0xc2b2ae35) ^ Math.imul(worldSeed, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

export interface RockSizes {
  /** Expected rocks per square metre between the smallest and largest size. */
  perM2: number
  /** Diameter (metres) for a uniform number in [0, 1): inverse of the cumulative count. */
  diameter: (u: number) => number
}

/**
 * Size distribution from the exponential abundance model: the area covered by rocks of diameter at least D
 * is F(D) = k·exp(-q·D), q = q0 + q1/k. The number of rocks per m² per metre of diameter is then
 * k·q·exp(-q·D) / (π·D²/4). Integrated numerically between dMin and dMax.
 */
export function rockSizes(k: number, q0: number, q1: number, dMin: number, dMax: number): RockSizes {
  const q = q0 + q1 / k
  const density = (d: number) => (k * q * Math.exp(-q * d)) / ((Math.PI * d * d) / 4)
  const STEPS = 400
  const ds: number[] = [dMin]
  const cum: number[] = [0]
  // Steps even in log(D): most rocks are small.
  const r = Math.pow(dMax / dMin, 1 / STEPS)
  for (let i = 1; i <= STEPS; i++) {
    const a = ds[i - 1]
    const b = a * r
    cum.push(cum[i - 1] + ((density(a) + density(b)) / 2) * (b - a))
    ds.push(b)
  }
  const total = cum[STEPS]
  return {
    perM2: total,
    diameter: (u) => {
      const target = u * total
      let lo = 0
      let hi = STEPS
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (cum[mid] < target) lo = mid
        else hi = mid
      }
      const span = cum[hi] - cum[lo]
      const f = span > 0 ? (target - cum[lo]) / span : 0
      return ds[lo] + f * (ds[hi] - ds[lo])
    },
  }
}

/** Poisson count with mean `lambda`, from `rand`. */
function poisson(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0
  if (lambda > 40) {
    // Normal approximation (Box-Muller); fine for drawing.
    const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z))
  }
  const l = Math.exp(-lambda)
  let n = 0
  let p = rand()
  while (p > l) {
    n++
    p *= rand()
  }
  return n
}

export interface Rock {
  /** Position inside the cell, -0.5 to 0.5 of a cell (east, north). */
  u: number
  v: number
  /** Diameter, metres. */
  d: number
  /** Height as a fraction of the diameter. */
  squash: number
  /** Turn about the vertical, radians, and which shape. */
  yaw: number
  variant: number
  /** 0 to 1: where the rock's colour sits between the basalt shades. */
  tone: number
}

/** The rocks in one cell of `areaM2` square metres. Same row, col and seed: same rocks. */
export function rocksForCell(
  row: number,
  col: number,
  areaM2: number,
  sizes: RockSizes,
  o: { worldSeed: number; variants: number; squashMin: number; squashMax: number },
): Rock[] {
  const rand = mulberry32(cellSeed(row, col, o.worldSeed))
  const n = poisson(sizes.perM2 * areaM2, rand)
  const rocks: Rock[] = []
  for (let i = 0; i < n; i++) {
    rocks.push({
      u: rand() - 0.5,
      v: rand() - 0.5,
      d: sizes.diameter(rand()),
      squash: o.squashMin + rand() * (o.squashMax - o.squashMin),
      yaw: rand() * Math.PI * 2,
      variant: Math.floor(rand() * o.variants),
      tone: rand(),
    })
  }
  return rocks
}
