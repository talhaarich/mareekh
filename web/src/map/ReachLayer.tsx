import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { useData } from '../state/data'
import { useView } from '../state/view'
import { ANCHOR_DATA } from './anchors'
import { LINE_MAX_S, LINE_STEP_S, RING_KM, useLines, useRings, useWalkBackM } from './reach'
import { gridCorners, hexToRgba } from './slopeGrid'
import { readToken } from './tokens'

/** "Reach from base": distance rings or walk-time lines, whichever the view slice asks for. */
export default function ReachLayer() {
  const reach = useView((s) => s.reach)
  const grid = useData((s) => s.grid)
  const rings = useRings()
  const lines = useLines()
  const colours = useMemo(() => ({ ring: readToken('--color-fg-muted'), route: readToken('--color-route') }), [])

  const ringData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: rings.map((r) => ({ ...r.ring, properties: { limit: r.limit ? 1 : 0 } })),
    }),
    [rings],
  )

  const lineUrl = useMemo(() => {
    if (reach !== 'time' || !grid || !lines) return null
    const { width, height } = grid.meta
    const [r, g, b] = hexToRgba(colours.route, 255)
    const px = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < lines.level.length; i++) {
      if (lines.level[i] === 0) continue
      px.set([r, g, b, 255], i * 4)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.putImageData(new ImageData(px, width, height), 0, 0)
    return canvas.toDataURL('image/png')
  }, [reach, grid, lines, colours.route])

  return (
    <>
      {reach === 'distance' && (
        <Source id="mm-reach-rings" type="geojson" data={ringData}>
          <Layer
            id="mm-reach-rings"
            beforeId={ANCHOR_DATA}
            type="line"
            paint={{
              'line-color': colours.ring,
              'line-width': ['case', ['==', ['get', 'limit'], 1], 2, 1.25],
              'line-dasharray': [3, 2],
              'line-opacity': 0.9,
            }}
          />
        </Source>
      )}
      {reach === 'time' && grid && lineUrl && (
        <Source id="mm-reach-lines" type="image" url={lineUrl} coordinates={gridCorners(grid.meta.bounds)}>
          <Layer
            id="mm-reach-lines"
            beforeId={ANCHOR_DATA}
            type="raster"
            paint={{ 'raster-resampling': 'nearest', 'raster-fade-duration': 0, 'raster-opacity': 0.9 }}
          />
        </Source>
      )}
    </>
  )
}

/** Colour key text for the reach layer. */
export function ReachKeyBlock() {
  const reach = useView((s) => s.reach)
  const walkBackM = useWalkBackM()
  if (reach === 'distance') {
    return (
      <div className="space-y-1">
        <div className="text-fg">
          <span className="text-fg-muted">Reach: </span>Distance rings
        </div>
        <div className="text-fg-muted">
          {RING_KM.join(', ')} km from base, straight line on the Mars sphere.
          {walkBackM !== null && ` Thicker ring: ${walkBackM / 1000} km walk-back limit (walk_back_max_m, NASA Constellation planning).`}
        </div>
        <div className="text-fg-muted">Note: a straight line is not a walk; see walk-time lines.</div>
      </div>
    )
  }
  if (reach === 'time') {
    return (
      <div className="space-y-1">
        <div className="text-fg">
          <span className="text-fg-muted">Reach: </span>Walk-time lines
        </div>
        <div className="text-fg-muted">
          Every {LINE_STEP_S / 60} min up to {LINE_MAX_S / 60} min of walking back to base. Source: route model, fastest
          way home at the current slope limit (walk-home field).
        </div>
      </div>
    )
  }
  return null
}
