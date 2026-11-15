import type { ReactNode } from 'react'

/** Panel section heading in the display face: "MAP VIEW", "GO OR NO-GO". */
export function PanelTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-fg ${className}`}>{children}</h2>
  )
}

/** A button that is orange-filled when on, like the prototype's controls. */
export function ChoiceButton({
  on,
  disabled = false,
  title,
  onClick,
  children,
  className = '',
}: {
  on: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`rounded-[3px] border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'border-brand bg-brand text-bg' : 'border-line bg-panel-2 text-fg hover:border-fg-muted'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Joined buttons, one of which is on. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string; disabled?: boolean; title?: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex">
      {options.map((o, i) => (
        <ChoiceButton
          key={o.id}
          on={value === o.id}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`flex-1 px-2 ${i > 0 ? '-ml-px' : ''} ${i === 0 ? 'rounded-r-none' : i === options.length - 1 ? 'rounded-l-none' : 'rounded-none'}`}
        >
          {o.label}
        </ChoiceButton>
      ))}
    </div>
  )
}
