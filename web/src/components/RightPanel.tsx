import Destinations from './Destinations'
import LimitsPanel from './LimitsPanel'
import PlanPanel from './PlanPanel'
import RehearsalPanel from './RehearsalPanel'
import type { RightPanelId } from './rightPanels'
import SafetyPanel from './SafetyPanel'

/** The contents of one right-hand panel. */
export default function RightPanel({ panel }: { panel: RightPanelId }) {
  return (
    <div className="space-y-4">
      {panel === 'plan' && (
        <>
          <PlanPanel part="status" />
          <PlanPanel part="summary" />
          <PlanPanel part="settings" />
        </>
      )}
      {panel === 'route' && <PlanPanel part="route" />}
      {panel === 'stops' && <Destinations />}
      {panel === 'rehearse' && <RehearsalPanel />}
      {panel === 'safety' && <SafetyPanel />}
      {panel === 'limits' && <LimitsPanel />}
    </div>
  )
}
