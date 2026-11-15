import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { usePlanParams } from '../components/planParams'
import { useData } from '../state/data'
import { ANCHOR_DATA } from './anchors'
import { classifySlope, gridCorners, hexToRgba, slopeGridPixels, slopeShares } from './slopeGrid'
import { readToken } from './tokens'

/** Overlay id for the slope grid in the view slice (CONVENTIONS layer id `slope`). Built in, not a manifest PNG. */
export const SLOPE_OVERLAY_ID = 'slope'

/** Plan limit (slider) and hard limit (assumptions), or null until both are known. */
function useLimits(): { plan: number; hard: number } | null {
  const params = usePlanParams((s) => s.params)
  const assumptions = useData((s) => s.assumptions)
  const hard = assumptions.find((a) => a.key === 'slope_limit_hard_deg')?.value
  return params && hard !== undefined ? { plan: params.slopeLimitDeg, hard } : null
}

/** Classes for the current limits; recomputed only when the grid or a limit changes. */
function useSlopeClasses() {
  const grid = useData((s) => s.grid)
  const limits = useLimits()
  const plan = limits?.plan
  const hard = limits?.hard
  return useMemo(
    () => (grid && plan !== undefined && hard !== undefined ? classifySlope(grid.slope, grid.meta.nodata, plan, hard) : null),
    [grid, plan, hard],
  )
}

/**
 * The slope grid the route planner uses, one square per 20 m cell, coloured against the plan's slope
 * limit (the slider) and the hard limit. Drawn from the loaded slope.bin, so it follows the slider.
 */
export default function SlopeGridLayer({ visible, opacity }: { visible: boolean; opacity: number }) {
  const grid = useData((s) => s.grid)
  const classes = useSlopeClasses()

  const url = useMemo(() => {
    if (!visible || !grid || !classes) return null
    const alpha = 255
    const px = slopeGridPixels(classes, {
      1: hexToRgba(readToken('--color-go'), alpha),
      2: hexToRgba(readToken('--color-caution'), alpha),
      3: hexToRgba(readToken('--color-nogo'), alpha),
    })
    const canvas = document.createElement('canvas')
    canvas.width = grid.meta.width
    canvas.height = grid.meta.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.putImageData(new ImageData(px, grid.meta.width, grid.meta.height), 0, 0)
    return canvas.toDataURL('image/png')
  }, [visible, grid, classes])

  if (!grid || !url) return null
  return (
    <Source id="mm-src-slope" type="image" url={url} coordinates={gridCorners(grid.meta.bounds)}>
      <Layer
        id="mm-overlay-slope"
        beforeId={ANCHOR_DATA}
        type="raster"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'raster-opacity': opacity, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 }}
      />
    </Source>
  )
}

/** Colour key for the slope grid, with the share of cells in each class. */
export function SlopeKeyBlock() {
  const grid = useData((s) => s.grid)
  const limits = useLimits()
  const classes = useSlopeClasses()
  if (!grid || !limits || !classes) return null
  const share = slopeShares(classes)
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`
  const deg = (v: number) => `${v}°`
  const rows: { cls: string; label: string }[] = [
    { cls: 'bg-go', label: `Walkable, up to ${deg(limits.plan)} (plan limit): ${pct(share.walkable)}` },
    { cls: 'bg-caution', label: `${deg(limits.plan)} to ${deg(limits.hard)}, over the plan limit: ${pct(share.overPlan)}` },
    { cls: 'bg-nogo', label: `Over ${deg(limits.hard)} (hard limit): ${pct(share.overHard)}` },
  ]
  return (
    <div className="space-y-1">
      <div className="text-fg">
        <span className="text-fg-muted">Overlay: </span>Slope grid (route planner)
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.cls} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-line ${r.cls}`} />
            {r.label}
          </li>
        ))}
      </ul>
      <div className="text-fg-muted">
        Source: slope from the CTX height grid, Horn method (our pipeline). Plan limit from the slider; hard limit
        slope_limit_hard_deg. Shares are of the {grid.meta.width} × {grid.meta.height} cells.
      </div>
      <div className="text-fg-muted">Note: one square is one {grid.meta.resM} m cell, exactly what the planner routes on.</div>
    </div>
  )
}
