/**
 * Screen-space label placement (pure, no DOM). Each label tries candidate spots around its marker,
 * nearest first, and keeps the one that overlaps least with markers, on-map controls, other labels
 * and the screen edge. A thin leader line joins a label to its marker when they are not adjacent.
 * Runs on every pan and zoom; it only moves labels, never the markers.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LabelInput {
  id: string
  /** Marker centre, screen pixels. */
  ax: number
  ay: number
  /** Label size, pixels. */
  w: number
  h: number
}

export interface PlacedLabel extends Rect {
  id: string
  /** Line from the marker edge to the nearest point of the label. Null when the label touches its marker. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null
}

export interface LayoutOptions {
  width: number
  height: number
  /** On-map controls and cards the labels must stay clear of. */
  obstacles: Rect[]
  /** Pixel radius kept clear around every marker. */
  markerRadius?: number
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// Preferred sides, in order: right, up-right, down-right, up, down, up-left, down-left, left.
const ANGLES = [0, -45, 45, -90, 90, -135, 135, 180].map((d) => (d * Math.PI) / 180)

export function layoutLabels(inputs: LabelInput[], opts: LayoutOptions): PlacedLabel[] {
  const R = opts.markerRadius ?? 14
  const screen: Rect = { x: 0, y: 0, w: opts.width, h: opts.height }
  const fixed: Rect[] = [
    ...inputs.map((i) => ({ x: i.ax - R, y: i.ay - R, w: 2 * R, h: 2 * R })),
    ...opts.obstacles,
  ]
  const distances = [R + 4, R + 24, R + 48, R + 80, R + 120, R + 170]
  const taken: Rect[] = []
  const placed: PlacedLabel[] = []

  // Fixed order (by id) so labels do not swap places between frames.
  for (const l of [...inputs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let best: Rect = { x: l.ax + R, y: l.ay - l.h / 2, w: l.w, h: l.h }
    let bestCost = Infinity
    for (let di = 0; di < distances.length && bestCost > 0; di++) {
      for (let k = 0; k < ANGLES.length; k++) {
        const cos = Math.cos(ANGLES[k])
        const sin = Math.sin(ANGLES[k])
        const px = l.ax + cos * distances[di]
        const py = l.ay + sin * distances[di]
        const r: Rect = {
          x: cos > 0.3 ? px : cos < -0.3 ? px - l.w : px - l.w / 2,
          y: sin > 0.3 ? py : sin < -0.3 ? py - l.h : py - l.h / 2,
          w: l.w,
          h: l.h,
        }
        let overlap = r.w * r.h - overlapArea(r, screen) // the part off screen counts as overlap
        for (const f of fixed) overlap += overlapArea(r, f)
        for (const t of taken) overlap += overlapArea(r, t)
        const cost = overlap * 1000 + di * 30 + k * 8
        if (cost < bestCost) {
          bestCost = cost
          best = r
        }
      }
    }
    taken.push(best)

    const nx = Math.min(Math.max(l.ax, best.x), best.x + best.w)
    const ny = Math.min(Math.max(l.ay, best.y), best.y + best.h)
    const dist = Math.hypot(nx - l.ax, ny - l.ay)
    placed.push({
      id: l.id,
      ...best,
      leader:
        dist > R + 8
          ? { x1: l.ax + ((nx - l.ax) / dist) * R, y1: l.ay + ((ny - l.ay) / dist) * R, x2: nx, y2: ny }
          : null,
    })
  }
  return placed
}
