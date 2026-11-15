import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

/** Steps for the turn and tilt buttons. Display choices. */
const TURN_STEP_DEG = 22.5
const TILT_STEP_DEG = 10
const EASE_MS = 300

type Move = 'left' | 'right' | 'up' | 'down'

const BUTTONS: { move: Move; label: string; glyph: string; title: string }[] = [
  { move: 'left', label: 'Turn left', glyph: '↺', title: `Turn left ${TURN_STEP_DEG}°` },
  { move: 'right', label: 'Turn right', glyph: '↻', title: `Turn right ${TURN_STEP_DEG}°` },
  { move: 'up', label: 'Tilt toward the horizon', glyph: '∠+', title: `Tilt ${TILT_STEP_DEG}° toward the horizon` },
  { move: 'down', label: 'Tilt toward straight down', glyph: '∠−', title: `Tilt ${TILT_STEP_DEG}° back toward straight down` },
]

/**
 * Turn and tilt buttons under MapLibre's zoom buttons, styled as a MapLibre control group, for anyone who
 * cannot right-drag (trackpads, touch). Right-drag, Ctrl + drag and two fingers still work as before.
 */
export default function TurnTiltControls({ mapRef }: { mapRef: RefObject<MapRef | null> }) {
  const move = (m: Move) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const bearing = map.getBearing()
    const pitch = map.getPitch()
    if (m === 'left') map.easeTo({ bearing: bearing - TURN_STEP_DEG, duration: EASE_MS })
    if (m === 'right') map.easeTo({ bearing: bearing + TURN_STEP_DEG, duration: EASE_MS })
    if (m === 'up') map.easeTo({ pitch: Math.min(map.getMaxPitch(), pitch + TILT_STEP_DEG), duration: EASE_MS })
    if (m === 'down') map.easeTo({ pitch: Math.max(0, pitch - TILT_STEP_DEG), duration: EASE_MS })
  }
  return (
    <div
      data-map-obstacle
      role="group"
      aria-label="Turn and tilt the map"
      className="maplibregl-ctrl maplibregl-ctrl-group absolute right-0 top-[110px] z-10 mr-[10px]"
    >
      {BUTTONS.map((b) => (
        <button
          key={b.move}
          type="button"
          aria-label={b.label}
          title={b.title}
          onClick={() => move(b.move)}
          className="!flex items-center justify-center font-mono text-[13px] font-bold text-black"
        >
          {b.glyph}
        </button>
      ))}
    </div>
  )
}
