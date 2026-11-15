import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Map as MaplibreMap } from 'maplibre-gl'
import type { MapRef } from 'react-map-gl/maplibre'
import { ease, FLAT_EXAGGERATION, TERRAIN_FLATTEN_MS, TERRAIN_RISE_MS } from './stationFlight'

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Frames to wait for the height source to be added to the map before giving up. */
const WAIT_FRAMES = 120

/**
 * Changes the exaggeration of the terrain already on the map, without rebuilding it. map.setTerrain()
 * rebuilds the terrain and its render textures on every call (measured: 7 fps when called each frame),
 * so animation steps set the value on the live terrain instead and ask for a repaint. maplibre-gl 6.18
 * keeps a second copy in its tile coverage; if a future version moves these, it falls back to setTerrain.
 */
function setLiveExaggeration(map: MaplibreMap, sourceId: string, x: number): void {
  const t = map.terrain
  const coverage = (t as unknown as { coverage?: { exaggeration?: number } } | null)?.coverage
  if (t && typeof t.exaggeration === 'number' && coverage && typeof coverage.exaggeration === 'number') {
    t.exaggeration = x
    t.options = { ...t.options, exaggeration: x }
    coverage.exaggeration = x
    map.triggerRepaint()
  } else {
    map.setTerrain({ source: sourceId, exaggeration: x })
  }
}

/**
 * Owns the map's 3D terrain (MissionMap passes no `terrain` prop, so react-map-gl never touches it).
 * 2D to 3D: the terrain is added flat and rises to the chosen exaggeration while the camera flies in.
 * 3D to 2D: it flattens while the camera levels, then is removed. Exaggeration changes apply directly.
 * With reduced motion it switches at once. Returns whether the map has terrain (for the sky).
 */
export function useTerrainTransition(
  mapRef: RefObject<MapRef | null>,
  ready: boolean,
  terrainOn: boolean,
  exaggeration: number,
  sourceId: string,
): boolean {
  const [shown, setShown] = useState(false)
  const target = useRef(exaggeration)
  const animating = useRef(false)

  // Slider moves while 3D is on: follow them, unless a rise or flatten is running.
  useEffect(() => {
    target.current = exaggeration
    const map = mapRef.current?.getMap()
    if (map?.terrain && !animating.current) setLiveExaggeration(map, sourceId, exaggeration)
  }, [exaggeration, mapRef, sourceId])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map) return
    let raf = 0
    let frames = 0
    const animate = (from: number, to: number, ms: number, done: () => void) => {
      animating.current = true
      const t0 = performance.now()
      const frame = (now: number) => {
        const t = (now - t0) / ms
        setLiveExaggeration(map, sourceId, ease(from, to, t))
        if (t < 1) raf = requestAnimationFrame(frame)
        else {
          animating.current = false
          done()
        }
      }
      raf = requestAnimationFrame(frame)
    }

    if (terrainOn) {
      const start = () => {
        // The height source mounts with the same render; wait for it.
        if (!map.getSource(sourceId)) {
          if (++frames < WAIT_FRAMES) raf = requestAnimationFrame(start)
          return
        }
        setShown(true)
        if (reducedMotion()) {
          if (map.terrain) setLiveExaggeration(map, sourceId, target.current)
          else map.setTerrain({ source: sourceId, exaggeration: target.current })
          return
        }
        // Added once, flat; every later step only changes the exaggeration.
        const from = map.terrain ? map.terrain.exaggeration : FLAT_EXAGGERATION
        if (!map.terrain) map.setTerrain({ source: sourceId, exaggeration: FLAT_EXAGGERATION })
        animate(from, target.current, TERRAIN_RISE_MS, () => setLiveExaggeration(map, sourceId, target.current))
      }
      raf = requestAnimationFrame(start)
    } else if (map.terrain) {
      const off = () => {
        map.setTerrain(null)
        setShown(false)
      }
      if (reducedMotion()) raf = requestAnimationFrame(off)
      else animate(map.terrain.exaggeration, FLAT_EXAGGERATION, TERRAIN_FLATTEN_MS, off)
    }
    return () => {
      cancelAnimationFrame(raf)
      animating.current = false
    }
  }, [terrainOn, ready, mapRef, sourceId])

  return shown
}
