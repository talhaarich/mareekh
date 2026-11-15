import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useInteraction } from '../map/interaction'
import { useView } from '../state/view'
import UiIcon from './icons'
import StatusChip from './StatusChip'

/** One floating panel: its rail button and what it shows. */
export interface ShellPanel {
  id: string
  label: string
  icon: ReactNode
  content: ReactNode
}

interface AppShellProps {
  /** Left rail: map controls (Map view, Reach, Data overlay, Field notes) */
  leftPanels: ShellPanel[]
  /** Right rail: plan, route, stops, rehearse, safety, limits */
  rightPanels: ShellPanel[]
  /** Map canvas: fills the whole window */
  children: ReactNode
  /** Shown top left, e.g. the region name from the manifest */
  regionName?: string
  /** A plain-words problem to show under the status, e.g. a data file that failed to load */
  notice?: string
}

type Side = 'left' | 'right'

/** Below this width panels open as bottom sheets, one at a time. Tailwind's sm breakpoint. */
const PHONE_QUERY = '(max-width: 639px)'

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/** True when typing in a field, so single-key shortcuts (F) stay out of the way. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

/** A square icon button with a tooltip that shows on hover and on keyboard focus. */
function RailButton({
  label,
  icon,
  on,
  onClick,
  tipSide,
  controls,
  id,
}: {
  label: string
  icon: ReactNode
  on: boolean
  onClick: () => void
  tipSide: Side
  controls?: string
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-pressed={controls ? undefined : on}
      aria-expanded={controls ? on : undefined}
      aria-controls={controls}
      onClick={onClick}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-md border shadow-lg backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg ${
        on ? 'border-brand bg-brand text-bg' : 'border-line bg-panel/95 text-fg hover:border-fg-muted'
      }`}
    >
      {icon}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-fg opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
          tipSide === 'right' ? 'left-full ml-2' : 'right-full mr-2'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

/**
 * Map-first layout: the map fills the window. Small icon rails at the left and right edges open the
 * panels as compact floating panels over the map (bottom sheets on phones), one per side at a time.
 * The walk status is always on screen. The areas the panels cover are published as map insets, so
 * labels and the position arrow keep out from under them.
 */
export default function AppShell({ leftPanels, rightPanels, children, regionName, notice }: AppShellProps) {
  const setMode = useView((s) => s.setMode)
  const setMapInsets = useInteraction((s) => s.setMapInsets)
  const phone = usePhone()
  const [open, setOpen] = useState<Record<Side, string | null>>({ left: null, right: null })
  const [hidden, setHidden] = useState(false)
  const [full, setFull] = useState(false)
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true

  const rootRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<Record<Side, HTMLDivElement | null>>({ left: null, right: null })
  const panelRef = useRef<Record<Side, HTMLDivElement | null>>({ left: null, right: null })
  const lastOpened = useRef<string | null>(null)

  const toggle = (side: Side, id: string) => {
    setOpen((cur) => {
      if (cur[side] === id) return { ...cur, [side]: null }
      lastOpened.current = id
      // On a phone both sides share the bottom of the screen: one sheet at a time.
      return phone ? { left: null, right: null, [side]: id } : { ...cur, [side]: id }
    })
  }
  const closeAll = useCallback((restoreFocus: boolean) => {
    setOpen((cur) => {
      if (cur.left === null && cur.right === null) return cur
      if (restoreFocus && lastOpened.current) document.getElementById(`rail-${lastOpened.current}`)?.focus()
      return { left: null, right: null }
    })
  }, [])

  // Move keyboard focus into a panel when it opens.
  const openLeft = open.left
  const openRight = open.right
  useEffect(() => {
    const id = lastOpened.current
    if (!id) return
    const side: Side | null = openLeft === id ? 'left' : openRight === id ? 'right' : null
    if (side) panelRef.current[side]?.focus()
  }, [openLeft, openRight])

  // Esc closes the panels. Clicking the map closes them too (markers and on-map cards do not count).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll(true)
    }
    const main = mainRef.current
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest('.maplibregl-canvas-container') && !t.closest('.maplibregl-marker')) closeAll(false)
    }
    window.addEventListener('keydown', onKey)
    main?.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      main?.removeEventListener('pointerdown', onDown)
    }
  }, [closeAll])

  // On a phone a sheet covers the map: close it when a pin type is picked, so the map can be clicked.
  useEffect(
    () =>
      useInteraction.subscribe((s, prev) => {
        if (s.pinDropType && !prev.pinDropType && window.matchMedia?.(PHONE_QUERY).matches) closeAll(false)
      }),
    [closeAll],
  )

  // Full screen on the app root; F toggles it.
  const toggleFull = useCallback(() => {
    if (!canFullscreen) return
    // The browser may refuse (no user gesture, embedded frame): then nothing changes.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen().catch(() => {})
  }, [canFullscreen])
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement !== null)
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e)) toggleFull()
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [toggleFull])

  // Publish the strips the floating UI covers, as CSS variables (for on-map cards) and map insets
  // (for labels and the position arrow). Re-measured on every layout change and resize.
  const [insetVars, setInsetVars] = useState<Record<string, string>>({})
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    const measure = () => {
      const m = main.getBoundingClientRect()
      const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null)
      let left = 0
      let right = 0
      let bottom = 0
      const top = Math.max(0, (r(topRef.current)?.bottom ?? m.top) - m.top)
      for (const side of ['left', 'right'] as const) {
        const rail = r(railRef.current[side])
        const panel = r(panelRef.current[side])
        for (const box of [rail, phone ? null : panel]) {
          if (!box) continue
          if (side === 'left') left = Math.max(left, box.right - m.left)
          else right = Math.max(right, m.right - box.left)
        }
        if (phone && panel) bottom = Math.max(bottom, m.bottom - panel.top)
      }
      const insets = { top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(left) }
      // The boxes themselves: each top-bar piece, both rails and any open panel.
      const boxes = [
        ...Array.from(topRef.current?.querySelectorAll(':scope > *, :scope > * > *') ?? []).filter((el) => el.getBoundingClientRect().width > 0),
        railRef.current.left,
        railRef.current.right,
        panelRef.current.left,
        panelRef.current.right,
      ]
      const areas = boxes.flatMap((el) => {
        const b = r(el)
        return b && b.width > 0 && b.height > 0
          ? [{ x: Math.round(b.left - m.left), y: Math.round(b.top - m.top), w: Math.round(b.width), h: Math.round(b.height) }]
          : []
      })
      setMapInsets(insets, areas)
      setInsetVars({
        '--mm-inset-top': `${insets.top}px`,
        '--mm-inset-right': `${insets.right}px`,
        '--mm-inset-bottom': `${insets.bottom}px`,
        '--mm-inset-left': `${insets.left}px`,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(main)
    for (const el of [topRef.current, railRef.current.left, railRef.current.right, panelRef.current.left, panelRef.current.right]) {
      if (el) ro.observe(el)
    }
    return () => ro.disconnect()
  }, [open, hidden, phone, notice, setMapInsets])

  const panelBox = phone
    ? 'absolute inset-x-0 bottom-0 z-40 max-h-[60%] rounded-t-lg border-t'
    : 'absolute top-[calc(var(--mm-inset-top,0px)+0.5rem)] z-40 max-h-[calc(100%-var(--mm-inset-top,0px)-1.25rem)] w-80 max-w-[calc(100%-7rem)] rounded-md border'

  const renderSide = (side: Side, panels: ShellPanel[]) => {
    const current = panels.find((p) => p.id === open[side]) ?? null
    return (
      <>
        <div
          ref={(el) => {
            railRef.current[side] = el
          }}
          role="toolbar"
          aria-label={side === 'left' ? 'Map controls' : 'Plan and safety'}
          aria-orientation="vertical"
          // Below the top bar, whatever its height (the status wraps onto two lines on a phone).
          className={`absolute top-[calc(var(--mm-inset-top,0px)+0.5rem)] z-30 flex flex-col gap-1.5 ${side === 'left' ? 'left-3' : 'right-3'}`}
        >
          {panels.map((p) => (
            <RailButton
              key={p.id}
              label={p.label}
              icon={p.icon}
              on={open[side] === p.id}
              onClick={() => toggle(side, p.id)}
              tipSide={side === 'left' ? 'right' : 'left'}
              controls={`panel-${side}`}
              id={`rail-${p.id}`}
            />
          ))}
        </div>
        {current && (
          <div
            id={`panel-${side}`}
            ref={(el) => {
              panelRef.current[side] = el
            }}
            role="dialog"
            aria-label={current.label}
            tabIndex={-1}
            className={`${panelBox} ${phone ? '' : side === 'left' ? 'left-16' : 'right-16'} overflow-y-auto border-line bg-panel/95 p-4 text-fg shadow-xl outline-none backdrop-blur`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{current.label}</span>
              <button
                type="button"
                onClick={() => toggle(side, current.id)}
                aria-label={`Close ${current.label}`}
                className="rounded border border-line px-2 text-xs text-fg-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
            {current.content}
          </div>
        )}
      </>
    )
  }

  return (
    <div
      ref={rootRef}
      style={insetVars}
      className="relative h-dvh w-screen overflow-hidden bg-bg font-sans text-fg print:hidden"
    >
      <main ref={mainRef} className="absolute inset-0">
        {children}
      </main>

      {/* Top bar: name, always-on status, mode and view toggles. Floats over the map. */}
      <div ref={topRef} className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
        <div
          title="Real Jezero data · planning and rehearsal, not mission-critical"
          className="pointer-events-auto hidden min-w-0 items-center gap-3 rounded-md border border-line bg-panel/95 px-3 py-1.5 shadow-lg backdrop-blur sm:flex"
        >
          <span className="font-display text-base font-bold tracking-wide text-fg">Martian Map</span>
          {regionName && <span className="hidden truncate text-xs text-fg-muted lg:inline">EVA-1 · {regionName}</span>}
          <span className="hidden shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-fg-muted 2xl:inline">
            Real Jezero data · planning and rehearsal, not mission-critical
          </span>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 sm:items-center">
          <StatusChip />
          {notice && (
            <div role="alert" className="pointer-events-auto max-w-md rounded-md border border-line bg-panel/95 px-3 py-1.5 text-xs text-fg-muted shadow">
              {notice}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('eva')}
            className="h-10 rounded-md border border-line bg-panel/95 px-3 text-sm font-medium text-fg shadow-lg backdrop-blur hover:border-fg-muted"
          >
            EVA mode
          </button>
          <RailButton
            label={hidden ? 'Show panels' : 'Hide panels'}
            icon={<UiIcon name={hidden ? 'show' : 'hide'} />}
            on={hidden}
            onClick={() => setHidden((h) => !h)}
            tipSide="left"
          />
          {canFullscreen && (
            <RailButton
              label={full ? 'Leave full screen (F)' : 'Full screen (F)'}
              icon={<UiIcon name={full ? 'exitFullscreen' : 'fullscreen'} />}
              on={full}
              onClick={toggleFull}
              tipSide="left"
            />
          )}
        </div>
      </div>

      {!hidden && renderSide('left', leftPanels)}
      {!hidden && renderSide('right', rightPanels)}
    </div>
  )
}
