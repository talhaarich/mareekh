import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { layoutLabels, type LabelInput, type PlacedLabel, type Rect } from './labelLayout'
import { readToken } from './tokens'

export interface LabelItem {
  id: string
  lat: number
  lon: number
  text: string
  /** If set, clicking the label opens that station's card. */
  stationId?: string
}

interface Props {
  mapRef: RefObject<MapRef | null>
  containerRef: RefObject<HTMLDivElement | null>
  ready: boolean
  items: LabelItem[]
  onSelectStation: (id: string) => void
}

const LABEL_HEIGHT = 20
const LABEL_PAD = 14 // px-1.5 each side plus a 1 px border each side

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = `12px ${readToken('--font-sans')}`
  return measureCtx.measureText(text).width
}

/** Rectangle of an element in container pixels. */
function relativeRect(el: Element, origin: DOMRect): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
}

/**
 * Labels with leader lines, laid out in screen space on every pan and zoom.
 * Anything marked data-map-obstacle (cards, the colour key) and MapLibre's own controls are kept clear.
 */
export default function MapLabels({ mapRef, containerRef, ready, items, onSelectStation }: Props) {
  const [placed, setPlaced] = useState<PlacedLabel[]>([])
  const frame = useRef(0)

  const widths = useMemo(
    () => new Map(items.map((i) => [i.id, Math.ceil(textWidth(i.text)) + LABEL_PAD])),
    [items],
  )

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!ready || !map || !container) return

    const run = () => {
      frame.current = 0
      const origin = container.getBoundingClientRect()
      const inputs: LabelInput[] = items.map((i) => {
        const p = map.project([i.lon, i.lat])
        return { id: i.id, ax: p.x, ay: p.y, w: widths.get(i.id) ?? 80, h: LABEL_HEIGHT }
      })
      const obstacles = Array.from(
        container.querySelectorAll('[data-map-obstacle], .maplibregl-ctrl-group'),
      ).map((el) => relativeRect(el, origin))
      setPlaced(layoutLabels(inputs, { width: origin.width, height: origin.height, obstacles }))
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
  }, [ready, items, widths, mapRef, containerRef])

  const byId = new Map(items.map((i) => [i.id, i]))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {placed.map(
          (p) =>
            p.leader && (
              <line
                key={p.id}
                x1={p.leader.x1}
                y1={p.leader.y1}
                x2={p.leader.x2}
                y2={p.leader.y2}
                className="stroke-fg-muted"
                strokeWidth={1}
              />
            ),
        )}
      </svg>
      {placed.map((p) => {
        const item = byId.get(p.id)
        if (!item) return null
        const box = 'absolute flex items-center rounded border border-line bg-panel/90 px-1.5 text-xs text-fg'
        const style = { left: p.x, top: p.y, width: p.w, height: p.h }
        return item.stationId ? (
          <button
            key={p.id}
            type="button"
            style={style}
            className={`${box} pointer-events-auto cursor-pointer hover:border-fg-muted`}
            onClick={() => onSelectStation(item.stationId as string)}
          >
            <span className="truncate">{item.text}</span>
          </button>
        ) : (
          <div key={p.id} style={style} className={box}>
            <span className="truncate">{item.text}</span>
          </div>
        )
      })}
    </div>
  )
}
