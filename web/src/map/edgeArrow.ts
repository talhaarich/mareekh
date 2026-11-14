/**
 * Where to put the "it's over there" arrow for a point that is off screen (pure, screen pixels).
 * The arrow sits on the ray from the screen centre to the point, clamped to the screen inset by
 * `inset` px, and points along that ray. Null when the point is already on screen.
 */
export interface EdgeArrow {
  x: number
  y: number
  /** Screen angle the arrow points, degrees: 0 = right, 90 = down (screen y grows downwards). */
  angleDeg: number
}

export function edgeArrow(p: { x: number; y: number }, width: number, height: number, inset: number): EdgeArrow | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  const onScreen = p.x >= inset && p.x <= width - inset && p.y >= inset && p.y <= height - inset
  if (onScreen) return null
  const cx = width / 2
  const cy = height / 2
  const dx = p.x - cx
  const dy = p.y - cy
  const sx = dx !== 0 ? (cx - inset) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (cy - inset) / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s, angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI }
}
