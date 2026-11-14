import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { edgeArrow, type EdgeArrow } from './edgeArrow'

interface Props {
  mapRef: RefObject<MapRef | null>
  containerRef: RefObject<HTMLDivElement | null>
  ready: boolean
  /** The simulated position, or null when it is not shown. */
  position: { lat: number; lon: number } | null
  onSelect: () => void
}

/** Distance kept between the arrow's centre and the map edge, px. Clears the zoom buttons' gutter. */
const INSET = 28

/**
 * When the simulated position is off screen, an arrow at the map edge points to it. Click to fly there.
 * Marked data-map-obstacle so labels stay clear of it.
 */
export default function PositionEdgeArrow({ mapRef, containerRef, ready, position, onSelect }: Props) {
  const [arrow, setArrow] = useState<EdgeArrow | null>(null)
  const frame = useRef(0)

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!ready || !map || !container) return
    const run = () => {
      frame.current = 0
      if (!position) {
        setArrow(null)
        return
      }
      const p = map.project([position.lon, position.lat])
      setArrow(edgeArrow(p, container.clientWidth, container.clientHeight, INSET))
    }
    const schedule = () => {
      if (frame.current === 0) frame.current = requestAnimationFrame(run)
    }
    schedule()
    map.on('move', schedule)
    map.on('resize', schedule)
    return () => {
      map.off('move', schedule)
      map.off('resize', schedule)
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [ready, position, mapRef, containerRef])

  if (!arrow) return null
  return (
    <button
      type="button"
      data-map-obstacle
      onClick={onSelect}
      aria-label="Simulated position is off screen. Fly to it."
      title="Simulated position is off screen. Click to fly to it."
      style={{ left: arrow.x, top: arrow.y }}
      className="absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-route bg-panel/95 shadow-lg"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${arrow.angleDeg}deg)` }}>
        <path d="M4 12 H18 M12 5 L19 12 L12 19" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" className="stroke-route" />
      </svg>
      <span className="pointer-events-none absolute top-full mt-0.5 whitespace-nowrap rounded bg-panel/90 px-1 text-[10px] text-route">
        Simulated
      </span>
    </button>
  )
}
