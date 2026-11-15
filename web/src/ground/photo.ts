/**
 * What the ground view takes from the 5 m orbital photo (the manifest's satellite picture), pure.
 * The photo is greyscale and already contains shading, so it is split in two:
 * - its low-pass (blurred) brightness, contrast-stretched, varies a regolith colour (the ground colour);
 * - its high-pass (fine detail) becomes a normal map, for lighting only (never heights or slopes).
 * Local contrast of the stretched photo sets how many illustrative rocks a cell gets.
 * Arrays are the photo's pixels in image order: row 0 is the north edge, column 0 the west edge.
 */

/** Brightness values at fractions `lo` and `hi` of the sorted pixels (e.g. 0.02 and 0.98), via a histogram. */
export function percentiles(lum: Float32Array, lo: number, hi: number, bins = 1024): [number, number] {
  const hist = new Uint32Array(bins)
  for (let i = 0; i < lum.length; i++) hist[Math.min(bins - 1, Math.max(0, Math.floor(lum[i] * bins)))]++
  const at = (f: number) => {
    const target = f * lum.length
    let sum = 0
    for (let b = 0; b < bins; b++) {
      sum += hist[b]
      if (sum >= target) return (b + 0.5) / bins
    }
    return 1
  }
  return [at(lo), at(hi)]
}

/** Brightness stretched so the `lo` and `hi` percentiles become 0 and 1 (clamped). */
export function stretch(lum: Float32Array, lo: number, hi: number): Float32Array {
  const [a, b] = percentiles(lum, lo, hi)
  const span = b > a ? b - a : 1
  const out = new Float32Array(lum.length)
  for (let i = 0; i < lum.length; i++) out[i] = Math.min(1, Math.max(0, (lum[i] - a) / span))
  return out
}

/**
 * Ground colour bytes (RGBA, sRGB, rows bottom first like the normal map): the regolith colour times
 * (base + gain x value) for each value of the low-pass stretched photo.
 */
export function colourMapRGBA(value: Float32Array, w: number, h: number, regolith: [number, number, number], base: number, gain: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = base + gain * value[y * w + x]
      const k = ((h - 1 - y) * w + x) * 4
      out[k] = Math.min(255, Math.round(regolith[0] * f))
      out[k + 1] = Math.min(255, Math.round(regolith[1] * f))
      out[k + 2] = Math.min(255, Math.round(regolith[2] * f))
      out[k + 3] = 255
    }
  }
  return out
}

/** Box blur of radius `r` pixels (edges clamped), via a summed-area table. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      const sum = sat[(y1 + 1) * (w + 1) + (x1 + 1)] - sat[y0 * (w + 1) + (x1 + 1)] - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0]
      out[y * w + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
    }
  }
  return out
}

export interface PhotoFields {
  width: number
  height: number
  /** Blurred brightness: the colour's light and dark areas, without the fine shading. */
  low: Float32Array
  /** Brightness minus its blur: the small-scale detail (craters, ridges, boulders fields). */
  highPass: Float32Array
  /** Local mean of |highPass|: how rough the ground looks. */
  rough: Float32Array
  /** Local mean brightness. */
  bright: Float32Array
  meanRough: number
  meanBright: number
}

/** Brightness (0 to 1) to the fields above. `blurPx`: high-pass radius; `areaPx`: roughness/brightness radius. */
export function photoFields(lum: Float32Array, w: number, h: number, blurPx: number, areaPx: number): PhotoFields {
  const low = boxBlur(lum, w, h, blurPx)
  const highPass = new Float32Array(w * h)
  const absHp = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    highPass[i] = lum[i] - low[i]
    absHp[i] = Math.abs(highPass[i])
  }
  const rough = boxBlur(absHp, w, h, areaPx)
  const bright = boxBlur(lum, w, h, areaPx)
  let sr = 0
  let sb = 0
  for (let i = 0; i < w * h; i++) {
    sr += rough[i]
    sb += bright[i]
  }
  return { width: w, height: h, low, highPass, rough, bright, meanRough: sr / (w * h), meanBright: sb / (w * h) }
}

/**
 * Tangent-space normal map (RGBA bytes) from the high-pass brightness, treating it as a small height:
 * x along the picture's u (east), y along v (north), z up. Rows are written bottom first, as WebGL
 * expects for a data texture (v = 0 at the bottom). `strength` scales the slopes.
 */
export function normalMapRGBA(highPass: Float32Array, w: number, h: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  const at = (x: number, y: number) => highPass[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Slope east, and north (image rows run south, so north is minus the row step).
      const ge = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength
      const gn = -(at(x, y + 1) - at(x, y - 1)) * 0.5 * strength
      const len = Math.hypot(ge, gn, 1)
      const k = ((h - 1 - y) * w + x) * 4
      out[k] = Math.round((0.5 - (0.5 * ge) / len) * 255)
      out[k + 1] = Math.round((0.5 - (0.5 * gn) / len) * 255)
      out[k + 2] = Math.round((0.5 + 0.5 / len) * 255)
      out[k + 3] = 255
    }
  }
  return out
}

/** Bilinear sample of a field at picture coordinates u (0 west to 1 east), v (0 south to 1 north). */
export function sampleField(field: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5))
  const y = Math.min(h - 1, Math.max(0, (1 - v) * h - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const a = field[y0 * w + x0] + (field[y0 * w + x1] - field[y0 * w + x0]) * fx
  const b = field[y1 * w + x0] + (field[y1 * w + x1] - field[y1 * w + x0]) * fx
  return a + (b - a) * fy
}

/**
 * How many rocks a cell gets relative to the curve (ILLUSTRATIVE), from the local contrast of the stretched
 * photo relative to its mean: more where the ground looks rough, fewer where it is smooth, never fewer than
 * `floor` (so no area is empty). Averages about 1 over the photo.
 */
export function rockDensityFactor(contrast: number, meanContrast: number, floor: number, cap: number): number {
  const r = meanContrast > 0 ? contrast / meanContrast : 1
  return Math.min(cap, Math.max(floor, floor + (1 - floor) * r))
}
