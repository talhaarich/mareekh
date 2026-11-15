import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { create } from 'zustand'
import { DASH, fmtBearing, fmtDistance, fmtDuration, fmtSignedDuration } from '../components/format'
import { usePlanParams } from '../components/planParams'
import { STATUS_STYLE } from '../components/status'
import { bearingDeg, distanceM, sample, walkHomeS } from '../lib/helpers'
import { destination, type LatLon } from '../lib/mars'
import { assumptionValue, useData, type Photo } from '../state/data'
import { usePlan } from '../state/plan'
import { selectTimeLeftS, usePosition } from '../state/position'
import { useView } from '../state/view'
import {
  GROUND_CRUISE_PITCH_DEG,
  GROUND_DRAG_DEG_PER_PX,
  GROUND_EYE_HEIGHT_M,
  GROUND_EYE_MAX_M,
  GROUND_EYE_MIN_M,
  GROUND_FLIGHT_CLEARANCE_M,
  GROUND_FLIGHT_MS,
  GROUND_PITCH_DEG,
  GROUND_PITCH_MAX_DEG,
  GROUND_PITCH_MIN_DEG,
} from './cameraPresets'
import { flightAt, planFlight, type Eye, type Look } from './groundFlight'
import { setGroundRestoring, swallowNextMapClick } from './groundFlags'
import { cameraPosition, centerDistanceM, mapToMarsM, marsToMapM, trueScaleFactor } from './groundScale'
import { nextStationId } from './groundTarget'
import { useInteraction } from './interaction'
import { maplibregl } from './maplibreSetup'

/** The simulated camera, for the overlay. Ephemeral display state, never saved. */
interface GroundCamera {
  flying: boolean
  eyeHeightM: number
  bearingDeg: number
  pitchDeg: number
}
const useGroundCamera = create<GroundCamera>()(() => ({
  flying: false,
  eyeHeightM: GROUND_EYE_HEIGHT_M,
  bearingDeg: 0,
  pitchDeg: GROUND_PITCH_DEG,
}))

/**
 * Highest MapLibre zoom used in the ground view. The camera sits at the eye whatever the zoom: the zoom only sets
 * how far along the view MapLibre's center is, and so which tiles it draws. Measured with maplibre-gl 6.18 and our
 * terrain tiles (maxzoom 12): looking down at 70°, no ground is drawn above zoom 15; at 14.5 it always is.
 */
const GROUND_MAP_ZOOM = 14.5
/** The rendered terrain height is used for the eye point only when it is this close to the height grid (Mars metres). */
const TERRAIN_AGREES_M = 30
/** Frames to wait for MapLibre to apply a terrain change before going on anyway. */
const WAIT_FRAMES = 120

const HANDLERS = ['dragPan', 'dragRotate', 'scrollZoom', 'boxZoom', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'] as const

/** What the ground view changes, to put back on exit. */
interface Saved {
  camera: { center: [number, number]; zoom: number; pitch: number; bearing: number; roll: number }
  terrain3d: boolean
  exaggeration: number
  maxPitch: number
  centerClamped: boolean
  handlers: Record<(typeof HANDLERS)[number], boolean>
}

function marsRadiusM(): number {
  return assumptionValue(useData.getState().assumptions, 'mars_radius_m')
}

/** Ground height at `p` from the height grid (Mars metres); null outside the grid or on no data. */
function gridHeightM(p: LatLon): number | null {
  if (!useData.getState().grid) return null
  return sample(p)?.heightM ?? null
}

/**
 * Ground under the eye: the height grid, raised to MapLibre's drawn terrain where that is higher and agrees
 * with the grid (the drawn terrain is interpolated from tiles and can sit a little above a grid cell).
 */
function eyeGroundM(map: MaplibreMap, p: LatLon, factor: number): number | null {
  const g = gridHeightM(p)
  if (g === null) return null
  const t = map.queryTerrainElevation([p.lon, p.lat])
  const drawn = t === null ? null : mapToMarsM(t, factor)
  return drawn !== null && Math.abs(drawn - g) <= TERRAIN_AGREES_M ? Math.max(g, drawn) : g
}

/**
 * Puts MapLibre's camera at `cam` (Mars metres), looking along its bearing and pitch; `groundM` is the ground
 * under it. MapLibre's center goes where the view meets that ground, as in its own views (this matters high
 * up), but never closer than GROUND_MAP_ZOOM allows (this matters near the ground).
 */
function placeCamera(map: MaplibreMap, cam: Eye & Look, factor: number, groundM: number): void {
  const pitchRad = (cam.pitchDeg * Math.PI) / 180
  const cos = Math.cos(pitchRad)
  const drop = cam.altM - groundM
  const toGround = cos > 0.02 && drop > 0 ? drop / cos : 0
  const minAlong = mapToMarsM(centerDistanceM(GROUND_MAP_ZOOM, cam.lat, map.getVerticalFieldOfView(), map.getCanvas().clientHeight), factor)
  const along = Math.max(toGround, minAlong)
  const target = destination(cam, cam.bearingDeg, along * Math.sin(pitchRad), marsRadiusM())
  const targetAltM = cam.altM - along * Math.cos(pitchRad)
  const opts = map.calculateCameraOptionsFromTo(
    new maplibregl.LngLat(cam.lon, cam.lat),
    marsToMapM(cam.altM, factor),
    new maplibregl.LngLat(target.lon, target.lat),
    marsToMapM(targetAltM, factor),
  )
  // Our own bearing and pitch: straight down, the computed bearing would be arbitrary.
  map.jumpTo({ ...opts, bearing: cam.bearingDeg, pitch: cam.pitchDeg })
}

/** Calls `then` once `ready()` holds, checking once per frame; goes on anyway after WAIT_FRAMES. Returns a cancel. */
function whenReady(ready: () => boolean, then: () => void): () => void {
  let frames = 0
  let raf = 0
  const check = () => {
    if (ready() || ++frames > WAIT_FRAMES) then()
    else raf = requestAnimationFrame(check)
  }
  raf = requestAnimationFrame(check)
  return () => cancelAnimationFrame(raf)
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Drives the camera for the ground view: saves and restores the map, flies in, and handles looking around.
 * Rendered once inside MissionMap.
 */
export function GroundViewController({ mapRef, ready }: { mapRef: RefObject<MapRef | null>; ready: boolean }) {
  const ground = useInteraction((s) => s.ground)
  const saved = useRef<Saved | null>(null)
  // Where the viewer stands: the point, its ground height (Mars metres), and the current view.
  const eye = useRef<{ at: LatLon; groundM: number; look: Look } | null>(null)
  const cancel = useRef<(() => void) | null>(null)
  const finishFlight = useRef<(() => void) | null>(null)

  // Enter, move, leave.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map) return
    cancel.current?.()
    finishFlight.current = null
    const factor = trueScaleFactor(marsRadiusM())

    if (ground && !saved.current) {
      const v = useView.getState()
      const c = map.getCenter()
      saved.current = {
        camera: { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), roll: map.getRoll() },
        terrain3d: v.terrain3d,
        exaggeration: v.exaggeration,
        maxPitch: map.getMaxPitch(),
        centerClamped: map.getCenterClampedToGround(),
        handlers: Object.fromEntries(HANDLERS.map((h) => [h, map[h].isEnabled()])) as Saved['handlers'],
      }
      for (const h of HANDLERS) map[h].disable()
      map.setMaxPitch(180) // the highest MapLibre 6.18 allows; needs centerClampedToGround off to look up
      map.setCenterClampedToGround(false)
      v.setTerrain3d(true)
      v.setExaggeration(factor)
    }

    if (ground) {
      const terrainAtTrueScale = () => Math.abs((map.getTerrain()?.exaggeration ?? 0) - factor) < 1e-6
      cancel.current = whenReady(terrainAtTrueScale, () => {
        const groundM = eyeGroundM(map, ground.at, factor)
        if (groundM === null) {
          useInteraction.getState().leaveGround() // outside the height grid: nothing to stand on
          return
        }
        const { stations } = useData.getState()
        const nextId = nextStationId(usePlan.getState().result?.legs, ground.at, ground.stationId, distanceM)
        const next = stations.find((s) => s.id === nextId)
        const endLook: Look = { bearingDeg: next ? bearingDeg(ground.at, next) : 0, pitchDeg: GROUND_PITCH_DEG }
        const end: Eye = { ...ground.at, altM: groundM + GROUND_EYE_HEIGHT_M }

        // Start from the current eye if already standing somewhere, else from wherever the camera is.
        const c = map.getCenter()
        const cam = cameraPosition({
          center: { lat: c.lat, lon: c.lng },
          zoom: map.getZoom(),
          pitchDeg: map.getPitch(),
          bearingDeg: map.getBearing(),
          centerElevationM: map.getCameraTargetElevation(),
          fovDeg: map.getVerticalFieldOfView(),
          heightPx: map.getCanvas().clientHeight,
        })
        const start: Eye = { lat: cam.lat, lon: cam.lon, altM: mapToMarsM(cam.altM, factor) }
        const startLook: Look = { bearingDeg: map.getBearing(), pitchDeg: map.getPitch() }
        const gridRes = useData.getState().grid?.meta.resM ?? 20
        const plan = planFlight(start, startLook, end, endLook, {
          heightAt: gridHeightM,
          distanceM,
          clearanceM: GROUND_FLIGHT_CLEARANCE_M,
          stepM: gridRes / 2,
          cruisePitchDeg: GROUND_CRUISE_PITCH_DEG,
        })

        const land = () => {
          cancel.current?.()
          finishFlight.current = null
          eye.current = { at: ground.at, groundM, look: endLook }
          placeCamera(map, flightAt(plan, 1), factor, groundM)
          useGroundCamera.setState({ flying: false, eyeHeightM: GROUND_EYE_HEIGHT_M, ...endLook })
        }
        if (prefersReducedMotion()) {
          land()
          return
        }
        useGroundCamera.setState({ flying: true })
        finishFlight.current = land
        const t0 = performance.now()
        let raf = 0
        const frame = (now: number) => {
          const t = (now - t0) / GROUND_FLIGHT_MS
          if (t >= 1) return land()
          const cam = flightAt(plan, t)
          placeCamera(map, cam, factor, gridHeightM(cam) ?? groundM)
          useGroundCamera.setState({ bearingDeg: cam.bearingDeg, pitchDeg: cam.pitchDeg })
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)
        cancel.current = () => cancelAnimationFrame(raf)
      })
      return
    }

    // Leave: put the 2D/3D choice and exaggeration back, then (once MapLibre has applied them) the camera.
    const s = saved.current
    if (!s) return
    saved.current = null
    eye.current = null
    useGroundCamera.setState({ flying: false })
    setGroundRestoring(true)
    const v = useView.getState()
    v.setTerrain3d(s.terrain3d)
    v.setExaggeration(s.exaggeration)
    const terrainBack = () => {
      const t = map.getTerrain()
      return s.terrain3d ? t !== null && Math.abs((t.exaggeration ?? 1) - s.exaggeration) < 1e-6 : t === null
    }
    cancel.current = whenReady(terrainBack, () => {
      map.setCenterClampedToGround(s.centerClamped)
      map.jumpTo({ center: s.camera.center, zoom: s.camera.zoom, pitch: s.camera.pitch, bearing: s.camera.bearing, roll: s.camera.roll })
      map.setMaxPitch(s.maxPitch)
      for (const h of HANDLERS) if (s.handlers[h]) map[h].enable()
      setGroundRestoring(false)
    })
  }, [ground, ready, mapRef])

  // Leaving the map (EVA mode) while standing: put the view settings back and leave the ground view.
  useEffect(
    () => () => {
      cancel.current?.()
      setGroundRestoring(false)
      const s = saved.current
      if (!s) return
      saved.current = null
      useView.getState().setTerrain3d(s.terrain3d)
      useView.getState().setExaggeration(s.exaggeration)
      useInteraction.getState().leaveGround()
    },
    [],
  )

  // Look around (drag), eye height (wheel), skip the flight (any click, Esc), leave (Esc).
  const active = ground !== null
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map || !active) return
    const el = map.getCanvasContainer()
    const factor = () => trueScaleFactor(marsRadiusM())
    const place = () => {
      const e = eye.current
      if (!e) return
      const h = useGroundCamera.getState().eyeHeightM
      placeCamera(map, { ...e.at, altM: e.groundM + h, ...e.look }, factor(), e.groundM)
      useGroundCamera.setState({ ...e.look })
    }

    let drag: { x: number; y: number; look: Look; id: number } | null = null
    const onDown = (ev: PointerEvent) => {
      if (finishFlight.current) {
        swallowNextMapClick()
        finishFlight.current()
        return
      }
      if (ev.button !== 0 || !eye.current) return
      drag = { x: ev.clientX, y: ev.clientY, look: eye.current.look, id: ev.pointerId }
    }
    const onMove = (ev: PointerEvent) => {
      if (!drag || ev.pointerId !== drag.id || !eye.current) return
      const dx = ev.clientX - drag.x
      const dy = ev.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3 && !el.hasPointerCapture(ev.pointerId)) el.setPointerCapture(ev.pointerId)
      // Grab the scene: dragging right turns the view left, dragging down looks up.
      eye.current.look = {
        bearingDeg: (((drag.look.bearingDeg - dx * GROUND_DRAG_DEG_PER_PX) % 360) + 360) % 360,
        pitchDeg: Math.min(GROUND_PITCH_MAX_DEG, Math.max(GROUND_PITCH_MIN_DEG, drag.look.pitchDeg + dy * GROUND_DRAG_DEG_PER_PX)),
      }
      place()
    }
    const onUp = (ev: PointerEvent) => {
      if (drag && ev.pointerId === drag.id) drag = null
    }
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      if (finishFlight.current || !eye.current) return
      const h = useGroundCamera.getState().eyeHeightM * Math.exp(ev.deltaY * 0.0015)
      useGroundCamera.setState({ eyeHeightM: Math.min(GROUND_EYE_MAX_M, Math.max(GROUND_EYE_MIN_M, h)) })
      place()
    }
    // Anywhere on the page, a click skips the flight.
    const onAnyDown = (ev: PointerEvent) => {
      if (finishFlight.current && !el.contains(ev.target as Node)) finishFlight.current()
    }
    // Capture phase, so this runs before the cards' own Esc handlers: an open card closes first.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      if (finishFlight.current) {
        finishFlight.current()
        return
      }
      const i = useInteraction.getState()
      if (i.inspectAt || i.selectedStationId || i.editingPinId || i.pinDropType || document.querySelector('[data-ground-lightbox]')) return
      i.leaveGround()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointerdown', onAnyDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointerdown', onAnyDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [active, ready, mapRef])

  return null
}

/** The station's first Navcam or Mastcam-Z photo, or null. */
function groundPhoto(photos: Photo[]): Photo | null {
  return photos.find((p) => /^(NAVCAM|MCZ)/.test(p.camera)) ?? null
}

function Readout({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-fg">{value}</span>
      </div>
      {source && <div className="text-[10px] leading-tight text-fg-muted">{source}</div>}
    </div>
  )
}

/** Screen overlay while standing on the ground: the simulated-view notice, readouts, and the rover's photo. */
export function GroundOverlay() {
  const ground = useInteraction((s) => s.ground)
  const leave = useInteraction((s) => s.leaveGround)
  const stations = useData((s) => s.stations)
  const result = usePlan((s) => s.result)
  usePlan((s) => s.walkHomeVersion) // re-read the walk-home field when a new one arrives
  const params = usePlanParams((s) => s.params)
  const timeLeftS = usePosition((s) => (params ? selectTimeLeftS(s, params.timeLimitS) : NaN))
  const cam = useGroundCamera()
  const [bigPhoto, setBigPhoto] = useState<Photo | null>(null)

  useEffect(() => {
    if (!bigPhoto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBigPhoto(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bigPhoto])

  if (!ground) return null
  const at = ground.at
  const base = stations[0]
  const next = stations.find((s) => s.id === nextStationId(result?.legs, at, ground.stationId, distanceM)) ?? null
  const station = ground.stationId ? stations.find((s) => s.id === ground.stationId) ?? null : null
  const photo = station ? groundPhoto(station.photos) : null
  const home = walkHomeS(at)
  const status = result ? STATUS_STYLE[result.status] : null
  const toText = (p: LatLon) => `${fmtDistance(distanceM(at, p))} · ${fmtBearing(bearingDeg(at, p))}`

  return (
    <>
      <div
        role="note"
        className="pointer-events-none absolute left-1/2 top-3 z-30 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md border border-caution bg-panel/95 px-3 py-1.5 text-center text-xs font-semibold text-fg shadow"
      >
        Simulated view from orbital data: 20 m heights, 5 m photo. Rocks are not visible.
      </div>

      <div
        data-map-obstacle
        className="absolute right-3 top-12 z-30 w-64 space-y-1.5 rounded-md border border-line bg-panel/95 p-3 text-xs text-fg shadow-lg"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{station ? `Standing at ${station.id}` : 'Standing on the map'}</h2>
          <button
            type="button"
            onClick={leave}
            className="rounded-[3px] border border-brand bg-brand px-2 py-1 text-xs font-medium text-bg"
          >
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
        <Readout label="Heading" value={fmtBearing(cam.bearingDeg)} source="Where the view faces" />
        <Readout label="Eye height" value={`${Math.round(cam.eyeHeightM)} m`} source="Above the height grid (display setting)" />
        {next && <Readout label={`To ${next.id} (next)`} value={toText(next)} source="Straight line on the Mars sphere" />}
        {base && <Readout label="To base" value={toText(base)} source="Straight line on the Mars sphere" />}
        <p className="pt-1 text-[10px] leading-tight text-fg-muted">
          {cam.flying
            ? 'Flying in… click anywhere or press Esc to skip.'
            : 'Drag to look around. Scroll to change eye height. Click the map, then Stand here, to move. Esc goes back.'}
        </p>
      </div>

      {station && photo && (
        <figure
          data-map-obstacle
          className="absolute bottom-3 right-3 z-30 w-64 space-y-1 rounded-md border border-line bg-panel/95 p-2 text-xs text-fg shadow-lg"
        >
          <figcaption className="text-sm font-semibold">What Perseverance saw here</figcaption>
          <button type="button" onClick={() => setBigPhoto(photo)} className="block w-full cursor-zoom-in" aria-label="Open the photo full size">
            <img src={photo.url} alt={`Rover photo at ${station.name}`} className="h-32 w-full rounded border border-line object-cover" />
          </button>
          <div className="text-[10px] leading-tight text-fg-muted">
            {photo.camera} · sol {photo.sol} · {photo.credit}
          </div>
        </figure>
      )}

      {bigPhoto && (
        <div
          data-ground-lightbox
          role="dialog"
          aria-label="Rover photo"
          onClick={() => setBigPhoto(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-2 bg-bg/90 p-4"
        >
          <img src={bigPhoto.url} alt="Rover photo, full size" className="max-h-[85vh] max-w-full rounded border border-line" />
          <div className="text-xs text-fg-muted">
            {bigPhoto.camera} · sol {bigPhoto.sol} · {bigPhoto.credit} · click or Esc to close
          </div>
        </div>
      )}
    </>
  )
}
