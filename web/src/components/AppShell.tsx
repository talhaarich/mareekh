import { useState } from 'react'
import type { ReactNode } from 'react'

interface AppShellProps {
  /** Left panel: map controls */
  left: ReactNode
  /** Right panel: plan, safety, limits */
  right: ReactNode
  /** Map canvas */
  children: ReactNode
  /** Shown in the header, e.g. the region name from the manifest */
  regionName?: string
}

type Drawer = 'left' | 'right' | null

/**
 * Four-zone mission-control layout: header, left panel, map canvas, right panel.
 * Wide screens show all four. Narrow screens show the map with the two panels as slide-over drawers.
 */
export default function AppShell({ left, right, children, regionName }: AppShellProps) {
  const [open, setOpen] = useState<Drawer>(null)
  const toggle = (d: Exclude<Drawer, null>) => setOpen((cur) => (cur === d ? null : d))

  const drawerBase = 'absolute inset-y-0 z-20 overflow-y-auto bg-panel p-4 transition-transform lg:static lg:translate-x-0'

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg font-sans text-fg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-brand">Martian Map</span>
          {regionName && <span className="hidden text-sm text-fg-muted sm:inline">{regionName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-fg-muted md:inline">Planning and rehearsal. Not mission-critical.</span>
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
            Plan
          </button>
        </div>
      </header>

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
