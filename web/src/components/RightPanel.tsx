import { useState } from 'react'
import Destinations from './Destinations'
import LimitsPanel from './LimitsPanel'
import PlanPanel from './PlanPanel'
import RehearsalPanel from './RehearsalPanel'
import SafetyPanel from './SafetyPanel'

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'route', label: 'Route' },
  { id: 'stops', label: 'Stops' },
  { id: 'rehearse', label: 'Rehearse' },
  { id: 'safety', label: 'Safety' },
  { id: 'limits', label: 'Limits' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Remembered per browser, so a reload opens the tab the crew was on. */
const TAB_KEY = 'mm.rightTab.v1'

function savedTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'plan'
  } catch {
    return 'plan'
  }
}

/**
 * Right panel: GO / NO-GO always on top, then one tab at a time instead of one long scroll.
 */
export default function RightPanel() {
  const [tab, setTab] = useState<Tab>(savedTab)
  const pick = (t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // storage blocked: the tab just is not remembered
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <PlanPanel part="status" />

      <div role="tablist" aria-label="Details" className="grid grid-cols-3 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="right-tabpanel"
            onClick={() => pick(t.id)}
            className={`rounded-[3px] border px-2 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-brand bg-brand text-bg' : 'border-line bg-panel-2 text-fg hover:border-fg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="right-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-4 border-t border-line pt-4">
        {tab === 'plan' && (
          <>
            <PlanPanel part="summary" />
            <PlanPanel part="settings" />
          </>
        )}
        {tab === 'route' && <PlanPanel part="route" />}
        {tab === 'stops' && <Destinations />}
        {tab === 'rehearse' && <RehearsalPanel />}
        {tab === 'safety' && <SafetyPanel />}
        {tab === 'limits' && <LimitsPanel />}
      </div>
    </div>
  )
}
