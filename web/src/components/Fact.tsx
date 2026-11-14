import type { ReactNode } from 'react'

/** Section heading used by the right-panel sections. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{children}</h2>
}

/** One number on screen: label, value with its unit, and where it came from (or "sample"). */
export function Fact({ label, value, source }: { label: string; value: string; source: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="font-mono text-sm text-fg">{value}</span>
      </div>
      <div className="text-[10px] leading-tight text-fg-muted">{source}</div>
    </div>
  )
}
