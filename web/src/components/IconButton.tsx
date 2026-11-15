import type { ReactNode } from 'react'

/**
 * An icon with a short caption underneath (always visible), and a longer tooltip on hover and keyboard
 * focus. Used for the panel rails, the top toolbar and the map controls, so nothing is icon-only.
 */
export default function IconButton({
  caption,
  label,
  tip,
  icon,
  on = false,
  onClick,
  tipSide = 'left',
  controls,
  id,
  disabled = false,
  wide = false,
}: {
  /** One or two words under the icon. */
  caption: string
  /** Name for screen readers. */
  label: string
  /** Longer description (and keyboard shortcut, if any) for the tooltip. */
  tip: string
  icon: ReactNode
  /** Highlighted: the panel is open, or the setting is on. */
  on?: boolean
  onClick: () => void
  tipSide?: 'left' | 'right' | 'top'
  /** When set, the button opens this element (aria-expanded); otherwise it is a toggle (aria-pressed). */
  controls?: string
  id?: string
  disabled?: boolean
  /** Allow a wider button for a two-word caption. */
  wide?: boolean
}) {
  const tipPlace =
    tipSide === 'right' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : tipSide === 'left' ? 'right-full top-1/2 mr-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-pressed={controls ? undefined : on}
      aria-expanded={controls ? on : undefined}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex ${wide ? 'min-w-16 px-1.5' : 'w-16 px-1'} flex-col items-center justify-center gap-0.5 rounded-md border py-1.5 shadow-lg backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'border-brand bg-brand text-bg' : 'border-line bg-panel/95 text-fg hover:border-fg-muted'
      }`}
    >
      {icon}
      <span className="whitespace-nowrap text-[11px] font-medium leading-tight">{caption}</span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-[16rem] whitespace-normal rounded border border-line bg-panel px-2 py-1 text-left text-xs font-medium text-fg opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${tipPlace}`}
      >
        {tip}
      </span>
    </button>
  )
}
