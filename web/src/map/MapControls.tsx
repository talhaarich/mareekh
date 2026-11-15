import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import IconButton from '../components/IconButton'
import UiIcon from '../components/icons'
import { useInteraction } from './interaction'

/** Steps for the buttons. Display choices. */
const TURN_STEP_DEG = 22.5
const TILT_STEP_DEG = 10
const EASE_MS = 300

type Move = 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'north'

/**
 * Zoom, turn, tilt and north buttons at the bottom right, each with a caption, replacing MapLibre's
 * unlabelled zoom and compass group. Mouse, wheel and touch gestures work as before. Kept clear of the
 * side rail and panels (the --mm-inset variables).
 */
export default function MapControls({ mapRef, ready }: { mapRef: RefObject<MapRef | null>; ready: boolean }) {
  // The north needle turns with the map, like MapLibre's compass did.
  const [bearing, setBearing] = useState(0)
  // A bottom sheet (phones) covers the map: the controls step aside until it closes.
  const sheetOpen = useInteraction((s) => s.mapInsets.bottom > 0)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map) return
    const onRotate = () => setBearing(map.getBearing())
    map.on('rotate', onRotate)
    return () => {
      map.off('rotate', onRotate)
    }
  }, [mapRef, ready])

  const move = (m: Move) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    if (m === 'in') map.zoomIn({ duration: EASE_MS })
    if (m === 'out') map.zoomOut({ duration: EASE_MS })
    if (m === 'left') map.easeTo({ bearing: map.getBearing() - TURN_STEP_DEG, duration: EASE_MS })
    if (m === 'right') map.easeTo({ bearing: map.getBearing() + TURN_STEP_DEG, duration: EASE_MS })
    if (m === 'up') map.easeTo({ pitch: Math.min(map.getMaxPitch(), map.getPitch() + TILT_STEP_DEG), duration: EASE_MS })
    if (m === 'down') map.easeTo({ pitch: Math.max(0, map.getPitch() - TILT_STEP_DEG), duration: EASE_MS })
    if (m === 'north') map.easeTo({ bearing: 0, pitch: 0, duration: EASE_MS * 2 })
  }

  const buttons: { m: Move; caption: string; label: string; tip: string; icon: React.ReactNode }[] = [
    { m: 'in', caption: 'Zoom in', label: 'Zoom in', tip: 'Zoom in (or scroll, or +)', icon: <UiIcon name="plus" /> },
    { m: 'out', caption: 'Zoom out', label: 'Zoom out', tip: 'Zoom out (or scroll, or −)', icon: <UiIcon name="minus" /> },
    { m: 'left', caption: 'Turn L', label: 'Turn left', tip: `Turn the map ${TURN_STEP_DEG}° left (or right-drag, or Ctrl + drag)`, icon: <UiIcon name="turnLeft" /> },
    { m: 'right', caption: 'Turn R', label: 'Turn right', tip: `Turn the map ${TURN_STEP_DEG}° right (or right-drag, or Ctrl + drag)`, icon: <UiIcon name="turnRight" /> },
    { m: 'up', caption: 'Tilt up', label: 'Tilt toward the horizon', tip: `Tilt ${TILT_STEP_DEG}° toward the horizon (or right-drag up)`, icon: <UiIcon name="tiltUp" /> },
    { m: 'down', caption: 'Tilt down', label: 'Tilt toward straight down', tip: `Tilt ${TILT_STEP_DEG}° back toward straight down`, icon: <UiIcon name="tiltDown" /> },
  ]

  if (sheetOpen) return null
  return (
    <div
      data-map-obstacle
      role="group"
      aria-label="Zoom, turn and tilt"
      className="absolute bottom-[calc(var(--mm-inset-bottom,0px)+0.75rem)] right-[calc(var(--mm-inset-right,0px)+0.75rem)] z-20 grid grid-cols-2 gap-1"
    >
      {buttons.map((b) => (
        <IconButton key={b.m} caption={b.caption} label={b.label} tip={b.tip} icon={b.icon} onClick={() => move(b.m)} tipSide="top" />
      ))}
      <div className="col-span-2 flex justify-center">
        <IconButton
          caption="North"
          label="Face north and look straight down"
          tip="Turn back to north up and flat (the needle shows which way is north)"
          icon={
            <span style={{ transform: `rotate(${-bearing}deg)` }} className="inline-flex">
              <UiIcon name="north" />
            </span>
          }
          onClick={() => move('north')}
          tipSide="top"
        />
      </div>
    </div>
  )
}
