/** The right-hand panels, in rail order. GO / NO-GO itself is always on screen (StatusChip), not in a panel. */
export const RIGHT_PANELS = [
  { id: 'plan', label: 'Plan' },
  { id: 'route', label: 'Route' },
  { id: 'stops', label: 'Stops' },
  { id: 'rehearse', label: 'Rehearse' },
  { id: 'safety', label: 'Safety' },
  { id: 'limits', label: 'Limits' },
] as const
export type RightPanelId = (typeof RIGHT_PANELS)[number]['id']
