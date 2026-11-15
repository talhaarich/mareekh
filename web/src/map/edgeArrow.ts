/**
 * Where to put the "it's over there" arrow for a point that is off screen (pure, screen pixels).
 * The arrow sits on the ray from the centre of the free area to the point, clamped to that area inset by
 * `inset` px, and points along that ray. The free area is the screen minus `pad` (strips covered by
 * panels). Null when the point is already in the free area.
 */
export interface EdgeArrow {
  x: number
  y: number
  /** Screen angle the arrow points, degrees: 0 = right, 90 = down (screen y grows downwards). */
  angleDeg: number
}

export function edgeArrow(
  p: { x: number; y: number },
  width: number,
  height: number,
  inset: number,
  pad: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
): EdgeArrow | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  const x0 = pad.left + inset
  const x1 = width - pad.right - inset
  const y0 = pad.top + inset
  const y1 = height - pad.bottom - inset
  const onScreen = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  if (onScreen) return null
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const dx = p.x - cx
  const dy = p.y - cy
  const sx = dx !== 0 ? Math.max(0, (x1 - x0) / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? Math.max(0, (y1 - y0) / 2) / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s, angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI }
}
