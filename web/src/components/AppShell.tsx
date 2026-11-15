import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useInteraction } from '../map/interaction'
import { useView } from '../state/view'

interface AppShellProps {
  /** Left panel: map controls */
  left: ReactNode
  /** Right panel: plan, safety, limits */
  right: ReactNode
  /** Map canvas */
  children: ReactNode
  /** Shown in the header, e.g. the region name from the manifest */
  regionName?: string
  /** A plain-words problem to show under the header, e.g. a data file that failed to load */
  notice?: string
}

type Drawer = 'left' | 'right' | null

/**
 * Four-zone mission-control layout: header, left panel, map canvas, right panel.
 * Wide screens show all four. Narrow screens show the map with the two panels as slide-over drawers.
 */
export default function AppShell({ left, right, children, regionName, notice }: AppShellProps) {
  const setMode = useView((s) => s.setMode)
  const [open, setOpen] = useState<Drawer>(null)
  const toggle = (d: Exclude<Drawer, null>) => setOpen((cur) => (cur === d ? null : d))

  // On narrow screens a drawer covers the map: close it when a pin type is picked, so the map can be clicked.
  useEffect(
    () =>
      useInteraction.subscribe((s, prev) => {
        if (s.pinDropType && !prev.pinDropType) setOpen(null)
      }),
    [],
  )

  const drawerBase = 'absolute inset-y-0 z-20 overflow-y-auto bg-panel p-4 transition-transform lg:static lg:translate-x-0'

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg font-sans text-fg print:hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-display text-xl font-bold tracking-wide text-fg sm:text-2xl">Martian Map</span>
          {regionName && (
            <span className="hidden truncate text-sm text-fg-muted md:inline">EVA-1 · {regionName}</span>
          )}
          <span className="hidden shrink-0 rounded-full border border-line px-3 py-0.5 font-mono text-xs text-fg-muted xl:inline">
            Real Jezero data · planning and rehearsal, not mission-critical
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div role="group" aria-label="Mode" className="flex">
            <button
              type="button"
              aria-pressed="true"
              className="hidden rounded-l-[3px] border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-bg sm:block"
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => setMode('eva')}
              className="rounded-[3px] border border-line sm:-ml-px sm:rounded-l-none bg-panel-2 px-3 py-1.5 text-sm font-medium text-fg hover:border-fg-muted"
            >
              EVA mode
            </button>
          </div>
          <button
            type="button"
            onClick={() => toggle('left')}
            aria-expanded={open === 'left'}
            className="rounded border border-line px-2 py-1 text-xs text-fg lg:hidden"
          >
            Layers
          </button>
          <button
            type="button"
            onClick={() => toggle('right')}
            aria-expanded={open === 'right'}
            className="rounded border border-line px-2 py-1 text-xs text-fg lg:hidden"
          >
            Details
          </button>
        </div>
      </header>

      {notice && (
        <div role="alert" className="shrink-0 border-b border-line bg-panel-2 px-4 py-2 text-xs text-fg-muted">
          {notice}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Map controls"
          className={`${drawerBase} left-0 w-72 shrink-0 border-r border-line ${open === 'left' ? '' : '-translate-x-full'}`}
        >
          {left}
        </aside>

        <main className="relative min-w-0 flex-1">{children}</main>

        <aside
          aria-label="Plan and safety"
          className={`${drawerBase} right-0 w-80 shrink-0 border-l border-line ${open === 'right' ? '' : 'translate-x-full'}`}
        >
          {right}
        </aside>
      </div>
    </div>
  )
}
