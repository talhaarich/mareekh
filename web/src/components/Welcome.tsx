import { useEffect, useRef } from 'react'
import { openGroundScene } from '../ground/open'
import { useInteraction } from '../map/interaction'
import { useData } from '../state/data'

/** The station the third "Try this" stands at (its name in stations.json). */
const DELTA_FRONT = 'Delta front, top of Hawksbill Gap'

/**
 * First-visit card over the map: what the tool is, and three things to try that really do the thing.
 * Closing it is remembered in this browser (mm.welcome.v1); the Help button opens it again.
 * Keyboard: focus starts on the first button, Tab stays inside the card, Esc closes it.
 */
export default function Welcome() {
  const open = useInteraction((s) => s.welcomeOpen)
  const setOpen = useInteraction((s) => s.setWelcomeOpen)
  const openPanel = useInteraction((s) => s.openPanel)
  const pulse = useInteraction((s) => s.pulseTargets)
  const stations = useData((s) => s.stations)
  const gridLoaded = useData((s) => s.grid !== null)
  const ref = useRef<HTMLDivElement | null>(null)
  const delta = stations.find((s) => s.name === DELTA_FRONT) ?? null

  useEffect(() => {
    if (!open) return
    const card = ref.current
    card?.querySelector<HTMLButtonElement>('button[data-first]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !card) return
      const items = [...card.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!card.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open) return null

  const tries = [
    {
      n: 1,
      text: 'See the plan',
      hint: 'The verdict and the route on the map',
      disabled: false,
      act: () => {
        openPanel('right', 'plan')
        pulse(['status', 'route'])
      },
    },
    {
      n: 2,
      text: 'Change the slope limit',
      hint: 'Drag it: the route and verdict update',
      disabled: false,
      act: () => {
        openPanel('right', 'plan')
        pulse(['slope'])
      },
    },
    {
      n: 3,
      text: 'Stand at the delta front',
      hint: 'A simulated 3D view from the ground',
      disabled: !delta || !gridLoaded,
      act: () => {
        if (delta) openGroundScene({ lat: delta.lat, lon: delta.lon }, delta.id)
      },
    },
  ]

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-text"
      className="absolute left-1/2 top-[calc(var(--mm-inset-top,0px)+0.75rem)] z-50 w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 space-y-3 rounded-lg border border-line bg-panel/95 p-4 text-fg shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="welcome-title" className="font-display text-lg font-semibold tracking-wide">
          Martian Map
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the welcome card"
          className="rounded border border-line px-2 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </div>
      <p id="welcome-text" className="text-sm leading-snug">
        Plan an astronaut's walk across Jezero Crater on real NASA terrain, and see whether it fits the time limit.
      </p>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Try this</div>
        <ol className="space-y-1.5">
          {tries.map((t) => (
            <li key={t.n}>
              <button
                type="button"
                data-first={t.n === 1 ? '' : undefined}
                disabled={t.disabled}
                onClick={() => {
                  t.act()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-panel-2 px-3 py-2 text-left hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-xs font-bold text-bg">
                  {t.n}
                </span>
                <span>
                  <span className="block text-sm font-medium">{t.text}</span>
                  <span className="block text-xs text-fg-muted">{t.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm text-route underline underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
      >
        Explore on my own
      </button>
    </div>
  )
}
