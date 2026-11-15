import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useInteraction } from '../map/interaction'
import { useTerrainSource } from '../map/terrain'
import { useData } from '../state/data'
import { useView } from '../state/view'
import IconButton from './IconButton'
import UiIcon from './icons'
import StatusChip from './StatusChip'
import Welcome from './Welcome'

/** One floating panel: its rail button and what it shows. */
export interface ShellPanel {
  id: string
  /** Full name (panel title, screen readers). */
  label: string
  /** One or two words under the rail icon. */
  caption: string
  /** Tooltip: what the panel holds. */
  tip: string
  /** First line of the panel: what it is for. */
  intro: string
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

/**
 * Map-first layout: the map fills the window. Small icon rails at the left and right edges open the
 * panels as compact floating panels over the map (bottom sheets on phones), one per side at a time.
 * The walk status is always on screen. The areas the panels cover are published as map insets, so
 * labels and the position arrow keep out from under them.
 */
export default function AppShell({ leftPanels, rightPanels, children, regionName, notice }: AppShellProps) {
  const setMode = useView((s) => s.setMode)
  const terrain3d = useView((s) => s.terrain3d)
  const setTerrain3d = useView((s) => s.setTerrain3d)
  const dem = useTerrainSource(useData((s) => s.manifest))
  const openWelcome = useInteraction((s) => s.setWelcomeOpen)
  const welcomeOpen = useInteraction((s) => s.welcomeOpen)
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

  // Other parts of the app (the welcome card) can ask for a panel to open.
  useEffect(
    () =>
      useInteraction.subscribe((s, prev) => {
        const r = s.panelRequest
        if (!r || r === prev.panelRequest) return
        lastOpened.current = r.id
        setHidden(false)
        setOpen((cur) => (window.matchMedia?.(PHONE_QUERY).matches ? { left: null, right: null, [r.side]: r.id } : { ...cur, [r.side]: r.id }))
      }),
    [],
  )

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
      // The boxes themselves: each top-bar piece, both rails, any open panel and the welcome card.
      const boxes = [
        rootRef.current?.querySelector('[aria-labelledby="welcome-title"]') ?? null,
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
  }, [open, hidden, phone, notice, welcomeOpen, setMapInsets])

  const panelBox = phone
    ? 'absolute inset-x-0 bottom-0 z-40 max-h-[60%] rounded-t-lg border-t'
    : 'absolute top-[calc(var(--mm-inset-top,0px)+0.5rem)] z-40 max-h-[calc(100%-var(--mm-inset-top,0px)-1.25rem)] w-80 max-w-[calc(100%-12rem)] rounded-md border'

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
            <IconButton
              key={p.id}
              caption={p.caption}
              label={p.label}
              tip={p.tip}
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
            className={`${panelBox} ${phone ? '' : side === 'left' ? 'left-[5.5rem]' : 'right-[5.5rem]'} overflow-y-auto border-line bg-panel/95 p-4 text-fg shadow-xl outline-none backdrop-blur`}
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
            <p className="mb-3 text-xs leading-snug text-fg">{current.intro}</p>
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
      {/* On a phone the toolbar takes the first row and the status the second, so neither covers the other. */}
      <div ref={topRef} className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap">
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

        <div className="order-2 flex w-full min-w-0 flex-col items-start gap-2 sm:order-none sm:w-auto sm:items-center">
          <StatusChip />
          {notice && (
            <div role="alert" className="pointer-events-auto max-w-md rounded-md border border-line bg-panel/95 px-3 py-1.5 text-xs text-fg-muted shadow">
              {notice}
            </div>
          )}
        </div>

        <div className="pointer-events-auto order-1 ml-auto flex shrink-0 items-stretch gap-1 sm:order-none sm:ml-0 sm:gap-1.5">
          <button
            type="button"
            onClick={() => setMode('eva')}
            title="A simple big-type screen for use outside: next stop, time left, way home"
            className="rounded-md border border-line bg-panel/95 px-2 text-sm font-medium text-fg shadow-lg backdrop-blur hover:border-fg-muted sm:px-3"
          >
            EVA<span className="hidden sm:inline"> mode</span>
          </button>
          <IconButton
            caption="Help"
            label="Help: show the welcome card"
            tip="What this map is, and three things to try"
            icon={<UiIcon name="help" />}
            onClick={() => openWelcome(true)}
          />
          <IconButton
            caption="3D"
            label="3D terrain"
            tip={dem ? 'Show the crater in 3D (the terrain rises from the flat map)' : 'No height tiles built yet'}
            icon={<UiIcon name="cube" />}
            on={terrain3d}
            disabled={!dem}
            onClick={() => setTerrain3d(!terrain3d)}
          />
          <IconButton
            caption={hidden ? 'Show' : 'Hide'}
            label={hidden ? 'Show panels' : 'Hide panels'}
            tip={hidden ? 'Show the side buttons and panels again' : 'Hide the side buttons and panels to see the whole map (the status stays)'}
            icon={<UiIcon name={hidden ? 'show' : 'hide'} />}
            on={hidden}
            onClick={() => setHidden((h) => !h)}
          />
          {canFullscreen && (
            <IconButton
              caption="Full screen"
              wide
              label={full ? 'Leave full screen' : 'Full screen'}
              tip={full ? 'Leave full screen (F)' : 'Fill the whole screen with the map (F)'}
              icon={<UiIcon name={full ? 'exitFullscreen' : 'fullscreen'} />}
              on={full}
              onClick={toggleFull}
            />
          )}
        </div>
      </div>

      {!hidden && renderSide('left', leftPanels)}
      {!hidden && renderSide('right', rightPanels)}
      <Welcome />
    </div>
  )
}
