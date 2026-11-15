/**
 * Walk-time lines (pure, no DOM): contours of the walk-home field (seconds to base per cell, grid
 * layout, Infinity when unreachable) every `stepS`, up to `maxS`. A cell is on line k when its time is
 * under k * stepS and a neighbour's is at or over it, so each line hugs the inside of its contour.
 */

export interface WalkTimeLines {
  /** Per cell: 0 = no line, k = on the k * stepS line. */
  level: Uint8Array
  /** A cell on each line to hang its label on (the northernmost), by level; null if the line is absent. */
  labelCell: (number | null)[]
}

export function walkTimeLines(field: Float32Array | Float64Array, width: number, height: number, stepS: number, maxS: number): WalkTimeLines {
  const levels = Math.floor(maxS / stepS)
  const level = new Uint8Array(width * height)
  const labelCell: (number | null)[] = Array.from({ length: levels + 1 }, () => null)
  const band = (t: number) => (Number.isFinite(t) ? Math.floor(t / stepS) : Infinity)

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c
      const b = band(field[i])
      if (b >= levels) continue // beyond the last line, or unreachable
      // The line between band b and b+1 runs along cells in band b that touch a reachable cell in a
      // higher band. Unreachable ground is a wall, not "further away", so it draws no line.
      const higher = (j: number) => Number.isFinite(field[j]) && band(field[j]) > b
      const edge =
        (c + 1 < width && higher(i + 1)) ||
        (c > 0 && higher(i - 1)) ||
        (r + 1 < height && higher(i + width)) ||
        (r > 0 && higher(i - width))
      if (!edge) continue
      const k = b + 1 // the k * stepS line
      level[i] = k
      if (labelCell[k] === null) labelCell[k] = i // rows scan north first, so the first hit is northernmost
    }
  }
  return { level, labelCell }
}
