import { useEffect, useRef, useState } from 'react'
import { DASH, fmtBearing, fmtDistance, fmtDuration, fmtSignedDuration } from '../components/format'
import { usePlanParams } from '../components/planParams'
import { STATUS_STYLE } from '../components/status'
import { dataUrl } from '../lib/dataUrl'
import { bearingDeg, distanceM, walkHomeS } from '../lib/helpers'
import type { LatLon } from '../lib/mars'
import { nextStationId } from './nextStation'
import { readToken } from '../map/tokens'
import { assumptionValue, useData, type Photo } from '../state/data'
import { usePlan } from '../state/plan'
import { selectTimeLeftS, usePosition } from '../state/position'
import { AT_STATION_M, FADE_IN_MS, FAST_TRAVEL, LOCAL_HOUR_MAX, LOCAL_HOUR_MIN, START_LOCAL_HOUR } from './constants'
import { GroundSceneController, type HudState } from './scene'

interface Props {
  at: LatLon
  stationId: string | null
  onClose: () => void
}

function Readout({ label, value, source, warn }: { label: string; value: string; source?: string; warn?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg-muted">{label}</span>
        <span className={`font-mono ${warn ? 'font-bold text-nogo' : 'text-fg'}`}>{value}</span>
      </div>
      {source && <div className="text-[10px] leading-tight text-fg-muted">{source}</div>}
    </div>
  )
}

function fmtHour(h: number): string {
  const m = Math.round(h * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Full-screen simulated ground view in its own three.js scene. Loaded on demand (React.lazy), so three.js
 * is not in the main bundle. Esc or "Back to map" closes it; closing disposes every three.js resource.
 */
export default function GroundScene({ at, stationId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const ctl = useRef<GroundSceneController | null>(null)
  const [hud, setHud] = useState<HudState | null>(null)
  const [hour, setHour] = useState(START_LOCAL_HOUR)
  const [bigPhoto, setBigPhoto] = useState<Photo | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const grid = useData((s) => s.grid)
  const stations = useData((s) => s.stations)
  const assumptions = useData((s) => s.assumptions)
  const result = usePlan((s) => s.result)
  usePlan((s) => s.walkHomeVersion) // re-read the walk-home field when a new one arrives
  const params = usePlanParams((s) => s.params)
  const timeLeftS = usePosition((s) => (params ? selectTimeLeftS(s, params.timeLimitS) : NaN))

  // Build the scene once per opening; dispose it on close.
  useEffect(() => {
    const container = containerRef.current
    const d = useData.getState()
    if (!container || !d.grid) return
    const satellite = d.manifest?.layers.find((l) => l.id === 'satellite' && l.coordinates)
    const coords = satellite?.coordinates ?? null
    const legs = usePlan.getState().result?.legs ?? []
    let c: GroundSceneController | null = null
    try {
      c = new GroundSceneController({
        container,
        grid: d.grid,
        marsRadiusM: assumptionValue(d.assumptions, 'mars_radius_m'),
        start: at,
        stations: d.stations,
        routes: legs.filter((l) => l.ok).map((l) => l.path),
        satellite:
          satellite && coords
            ? {
                url: dataUrl(satellite.url),
                west: Math.min(...coords.map((p) => p[0])),
                east: Math.max(...coords.map((p) => p[0])),
                south: Math.min(...coords.map((p) => p[1])),
                north: Math.max(...coords.map((p) => p[1])),
              }
            : null,
        tau: d.conditions?.tau ?? 0,
        walkSpeedMs: assumptionValue(d.assumptions, 'walk_speed_long_ms'),
        hardSlopeDeg: assumptionValue(d.assumptions, 'slope_limit_hard_deg'),
        colors: {
          skyHorizon: readToken('--color-shade-light'),
          skyZenith: readToken('--color-relief-4'),
          sunGlow: readToken('--color-fg'),
          regolith: readToken('--color-relief-4'),
          rock: readToken('--color-relief-3'),
          route: readToken('--color-route'),
          base: readToken('--color-brand'),
          station: readToken('--color-fg'),
          labelText: readToken('--color-fg'),
          labelBack: readToken('--color-bg'),
        },
        onHud: setHud,
      })
      // Face the next station on the planned route, or north with no plan.
      const nextId = nextStationId(legs, at, stationId, distanceM)
      const next = d.stations.find((s) => s.id === nextId)
      if (next) c.setHeading(bearingDeg(at, next))
      ctl.current = c
    } catch (e) {
      // WebGL unavailable, for example. Reported on screen instead of a blank page.
      queueMicrotask(() => setFailed(e instanceof Error ? e.message : String(e)))
    }
    return () => {
      c?.dispose()
      ctl.current = null
    }
  }, [at, stationId])

  useEffect(() => {
    ctl.current?.setLocalHour(hour)
  }, [hour])

  // Fade in from the map (skipped with reduced motion).
  useEffect(() => {
    const el = rootRef.current
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduce || typeof el.animate !== 'function') return
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: 'ease-out' })
    return () => a.cancel()
  }, [])

  // Esc: close the photo first, else the ground view. Captured, so the map underneath never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      if (bigPhoto) setBigPhoto(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bigPhoto, onClose])

  const here = hud?.position ?? at
  const base = stations[0]
  const atStation = stations.find((s) => distanceM(here, s) <= AT_STATION_M) ?? null
  const legs = result?.legs
  const next = stations.find((s) => s.id === nextStationId(legs, here, atStation?.id ?? null, distanceM)) ?? null
  const photo = atStation?.photos.find((p) => /^(NAVCAM|MCZ)/.test(p.camera)) ?? null
  const home = grid ? walkHomeS(here) : NaN
  const status = result ? STATUS_STYLE[result.status] : null
  const toText = (p: LatLon) => `${fmtDistance(distanceM(here, p))} · ${fmtBearing(bearingDeg(here, p))}`
  const planLimit = params?.slopeLimitDeg
  const steep = hud?.slopeDeg != null && planLimit !== undefined && hud.slopeDeg > planLimit
  const walkSpeed = assumptions.some((a) => a.key === 'walk_speed_long_ms') ? assumptionValue(assumptions, 'walk_speed_long_ms') : NaN

  return (
    <div ref={rootRef} role="dialog" aria-label="Simulated ground view" className="fixed inset-0 z-[1000] bg-bg font-sans text-fg">
      <div ref={containerRef} className="absolute inset-0" />

      <div
        role="note"
        className="pointer-events-none absolute left-1/2 top-3 z-10 w-[min(44rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-md border border-caution bg-panel/95 px-3 py-1.5 text-center text-xs font-semibold shadow"
      >
        Simulated view. Heights from orbital data every {grid?.meta.resM ?? 20} m; small bumps and rocks are illustrative, real
        rocks are too small to see from orbit.
      </div>

      {(failed || !grid) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="space-y-3 rounded-md border border-line bg-panel p-4 text-sm">
            <p>{failed ? `The 3D view could not start: ${failed}` : 'The height grid has not loaded, so there is nothing to stand on.'}</p>
            <button type="button" onClick={onClose} className="rounded-[3px] border border-brand bg-brand px-3 py-1.5 font-medium text-bg">
              Back to map
            </button>
          </div>
        </div>
      )}

      {hud?.loading !== false && !failed && grid && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-fg-muted">Building the ground…</div>
      )}

      <div className="absolute left-3 top-14 z-10 w-72 space-y-1.5 rounded-md border border-line bg-panel/95 p-3 text-xs shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{atStation ? `At ${atStation.id} · ${atStation.name}` : 'Simulated ground view'}</h2>
          <button type="button" onClick={onClose} className="rounded-[3px] border border-brand bg-brand px-2 py-1 font-medium text-bg">
            Back to map
          </button>
        </div>
        {status && result ? (
          <div className="flex items-center gap-2">
            <span className={`shrink-0 rounded-[3px] border px-2 py-0.5 font-display text-sm font-bold tracking-wider ${status.cls}`}>
              {status.label}
            </span>
            <span className="leading-tight">{result.reason}</span>
          </div>
        ) : (
          <div className="text-fg-muted">No plan yet.</div>
        )}
        <Readout
          label="Time left"
          value={fmtSignedDuration(timeLeftS)}
          source={params ? `${fmtDuration(params.timeLimitS)} limit minus the walk clock` : undefined}
        />
        <Readout
          label="Walk home from here"
          value={Number.isNaN(home) ? DASH : Number.isFinite(home) ? fmtDuration(home) : 'no path'}
          source="Route model, fastest way to base"
        />
        <Readout
          label="Slope here"
          value={hud?.slopeDeg != null ? `${hud.slopeDeg.toFixed(1)}°` : DASH}
          source={
            steep
              ? `Over the ${planLimit}° plan limit. Horn slope, 20 m cell (slope.bin)`
              : 'Horn slope of the 20 m cell under your feet (slope.bin)'
          }
          warn={steep}
        />
        <Readout label="Heading" value={hud ? fmtBearing(hud.headingDeg) : DASH} source="Where you face" />
        <Readout label="Eye height" value={hud ? `${hud.eyeHeightM} m` : DASH} source="Team assumption: suited crew member standing" />
        {next && <Readout label={`To ${next.id} (next)`} value={toText(next)} source="Straight line on the Mars sphere" />}
        {base && <Readout label="To base" value={toText(base)} source="Straight line on the Mars sphere" />}
      </div>

      <div className="absolute bottom-3 left-3 z-10 w-72 space-y-2 rounded-md border border-line bg-panel/95 p-3 text-xs shadow-lg">
        <label className="block text-fg-muted">
          Local time {fmtHour(hour)} <span className="text-[10px]">(sun direction approximate: no season, equinox sun)</span>
          <input
            type="range"
            min={LOCAL_HOUR_MIN}
            max={LOCAL_HOUR_MAX}
            step={0.25}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="mt-1 w-full accent-brand"
          />
        </label>
        <p className="leading-tight text-fg-muted">
          Drag to look around. W A S D or the arrow keys walk at {Number.isFinite(walkSpeed) ? `${walkSpeed} m/s` : DASH}{' '}
          (walk_speed_long_ms). Hold Shift for fast travel ({FAST_TRAVEL}×). Esc: back to map.
        </p>
        <div className="flex justify-between text-[10px] text-fg-muted">
          <span>
            Detail: {hud?.quality ?? DASH} (automatic){hud && hud.fps > 0 ? ` · ${Math.round(hud.fps)} fps` : ''}
          </span>
          {hud?.fast && <span className="font-semibold text-caution">Fast travel {FAST_TRAVEL}×</span>}
        </div>
      </div>

      {atStation && photo && (
        <figure className="absolute bottom-3 right-3 z-10 w-64 space-y-1 rounded-md border border-line bg-panel/95 p-2 text-xs shadow-lg">
          <figcaption className="text-sm font-semibold">What Perseverance saw here</figcaption>
          <button type="button" onClick={() => setBigPhoto(photo)} className="block w-full cursor-zoom-in" aria-label="Open the photo full size">
            <img src={photo.url} alt={`Rover photo at ${atStation.name}`} className="h-32 w-full rounded border border-line object-cover" />
          </button>
          <div className="text-[10px] leading-tight text-fg-muted">
            {photo.camera} · sol {photo.sol} · {photo.credit}
          </div>
        </figure>
      )}

      {bigPhoto && (
        <div
          role="dialog"
          aria-label="Rover photo"
          onClick={() => setBigPhoto(null)}
          className="absolute inset-0 z-30 flex cursor-zoom-out flex-col items-center justify-center gap-2 bg-bg/90 p-4"
        >
          <img src={bigPhoto.url} alt="Rover photo, full size" className="max-h-[85vh] max-w-full rounded border border-line" />
          <div className="text-xs text-fg-muted">
            {bigPhoto.camera} · sol {bigPhoto.sol} · {bigPhoto.credit} · click or Esc to close
          </div>
        </div>
      )}
    </div>
  )
}
