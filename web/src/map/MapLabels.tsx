import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { layoutLabels, wrapLabel, type LabelInput, type PlacedLabel, type Rect, type Segment } from './labelLayout'
import { readToken } from './tokens'

export interface LabelItem {
  id: string
  lat: number
  lon: number
  text: string
  /** If set, the label is a button: e.g. open that station's card or that pin's note. */
  onSelect?: () => void
}

interface Props {
  mapRef: RefObject<MapRef | null>
  containerRef: RefObject<HTMLDivElement | null>
  ready: boolean
  items: LabelItem[]
  /** Lines to keep labels off (the route legs), as lat/lon paths. */
  avoidLines?: { lat: number; lon: number }[][]
  /** Changes when something the labels must avoid changes size (e.g. the map key opens or closes). */
  relayoutKey?: unknown
  /** Boxes covered by panels outside the map (map pixels); labels keep out of them. */
  keepOut?: Rect[]
}

const LINE_HEIGHT = 15 // px per text line inside a label
const LABEL_VPAD = 5 // top + bottom padding and border
/** Wider than this, a label wraps onto two lines. */
const MAX_ONE_LINE_W = 170
/** Route points closer than this on screen are merged, so long routes stay cheap to avoid. */
const MIN_SEGMENT_PX = 6
const LABEL_PAD = 18 // px-2 each side plus a 1 px border each side

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = `600 12px ${readToken('--font-mono')}`
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
export default function MapLabels({ mapRef, containerRef, ready, items, avoidLines, relayoutKey, keepOut }: Props) {
  const [placed, setPlaced] = useState<PlacedLabel[]>([])
  const frame = useRef(0)

  const shapes = useMemo(
    () =>
      new Map(
        items.map((i) => {
          const lines = wrapLabel(i.text, textWidth, MAX_ONE_LINE_W)
          const w = Math.ceil(Math.max(...lines.map(textWidth))) + LABEL_PAD
          return [i.id, { lines, w, h: lines.length * LINE_HEIGHT + LABEL_VPAD }]
        }),
      ),
    [items],
  )

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!ready || !map || !container) return

    const run = () => {
      frame.current = 0
      const origin = container.getBoundingClientRect()
      const { width: W, height: H } = origin
      const panels = keepOut ?? []
      // A marker under a panel is hidden by it: so is its label.
      const covered = (x: number, y: number) => panels.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
      const inputs: LabelInput[] = []
      for (const i of items) {
        const p = map.project([i.lon, i.lat])
        if (covered(p.x, p.y)) continue
        const s = shapes.get(i.id)
        inputs.push({ id: i.id, ax: p.x, ay: p.y, w: s?.w ?? 80, h: s?.h ?? LINE_HEIGHT + LABEL_VPAD })
      }
      const lines: Segment[] = []
      for (const path of avoidLines ?? []) {
        let prev: { x: number; y: number } | null = null
        for (const pt of path) {
          const q = map.project([pt.lon, pt.lat])
          if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < MIN_SEGMENT_PX) continue
          if (prev) lines.push({ x1: prev.x, y1: prev.y, x2: q.x, y2: q.y })
          prev = q
        }
      }
      const obstacles = Array.from(
        container.querySelectorAll('[data-map-obstacle], .maplibregl-ctrl-group'),
      ).map((el) => relativeRect(el, origin))
      setPlaced(layoutLabels(inputs, { width: W, height: H, obstacles, lines, keepOut: panels }))
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
  }, [ready, items, shapes, avoidLines, relayoutKey, keepOut, mapRef, containerRef])

  const byId = new Map(items.map((i) => [i.id, i]))

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
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
        const box =
          'absolute flex items-center rounded-[2px] border border-fg/75 bg-bg/90 px-2 text-left font-mono text-[12px] font-semibold text-fg'
        const style = { left: p.x, top: p.y, width: p.w, height: p.h }
        return item.onSelect ? (
          <button
            key={p.id}
            type="button"
            style={style}
            className={`${box} pointer-events-auto cursor-pointer hover:border-brand`}
            onClick={item.onSelect}
          >
            <span className="block min-w-0 leading-[15px]">
              {(shapes.get(p.id)?.lines ?? [item.text]).map((line, k) => (
                <span key={k} className="block truncate">
                  {line}
                </span>
              ))}
            </span>
          </button>
        ) : (
          <div key={p.id} style={style} className={box}>
            <span className="block min-w-0 leading-[15px]">
              {(shapes.get(p.id)?.lines ?? [item.text]).map((line, k) => (
                <span key={k} className="block truncate">
                  {line}
                </span>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
