import type { Map as MaplibreMap } from 'maplibre-gl'
import { readToken } from './tokens'

/** Image id of the direction chevron drawn along the route. */
export const ROUTE_ARROW = 'mm-route-arrow'

/** Draws a right-pointing chevron in the route colour and registers it with the map (once). */
export function addRouteArrow(map: MaplibreMap): void {
  if (map.hasImage(ROUTE_ARROW)) return
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // dark outline under a route-coloured chevron, so it reads on light and dark ground
  for (const [colour, width] of [[readToken('--color-bg'), 9], [readToken('--color-route'), 5]] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(11, 8)
    ctx.lineTo(21, 16)
    ctx.lineTo(11, 24)
    ctx.stroke()
  }
  map.addImage(ROUTE_ARROW, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 })
}
