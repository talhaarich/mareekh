import { useEffect } from 'react'
import AppShell from './components/AppShell'
import LayerControls from './components/LayerControls'
import MissionMap from './map/MissionMap'
import { useMissionData } from './map/useMissionData'

/** Stands in for the plan, safety and limits panels (Tasks 6 and 8). Shows no numbers. */
function RightPanelPlaceholder() {
  return (
    <div className="space-y-2 text-sm text-fg-muted">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider">Plan</h2>
      <p>The plan, safety and limits panels arrive here.</p>
    </div>
  )
}

export default function App() {
  const load = useMissionData((s) => s.load)
  const regionName = useMissionData((s) => s.manifest?.region.name)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell left={<LayerControls />} right={<RightPanelPlaceholder />} regionName={regionName}>
      <MissionMap />
    </AppShell>
  )
}
