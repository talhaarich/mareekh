import type { PlanResult } from '../lib/plan'

/** Cockpit status colours: the only place red, amber and green are used. Status meaning only, never decoration. */
export const STATUS_STYLE: Record<PlanResult['status'], { label: string; cls: string }> = {
  go: { label: 'GO', cls: 'border-go bg-go/15 text-go' },
  caution: { label: 'CAUTION', cls: 'border-caution bg-caution/15 text-caution' },
  nogo: { label: 'NO-GO', cls: 'border-nogo bg-nogo/15 text-nogo' },
}
