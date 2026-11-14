import { useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import FieldNotes from './components/FieldNotes'
import LayerControls from './components/LayerControls'
import LimitsPanel from './components/LimitsPanel'
import PlanPanel from './components/PlanPanel'
import SafetyPanel from './components/SafetyPanel'
import { usePlanner } from './components/planParams'
import MissionMap from './map/MissionMap'
import { useLayerAvailability } from './map/useLayerAvailability'
import { useData } from './state/data'

export default function App() {
  const load = useData((s) => s.load)
  const manifest = useData((s) => s.manifest)
  const checkLayers = useLayerAvailability((s) => s.check)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Talha's loader reads every data file once; if a file is missing or breaks its contract it
  // rejects with the file and field name, which we show instead of leaving a blank screen.
  useEffect(() => {
    load().catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [load])

  useEffect(() => {
    if (manifest) void checkLayers(manifest)
  }, [manifest, checkLayers])

  usePlanner()

  return (
    <AppShell
      left={
        <div className="space-y-8">
          <LayerControls />
          <FieldNotes />
        </div>
      }
      right={
        <div className="space-y-8">
          <PlanPanel />
          <SafetyPanel />
          <LimitsPanel />
        </div>
      }
      regionName={manifest?.region.name}
      notice={loadError ? `Data could not be loaded: ${loadError}` : undefined}
    >
      <MissionMap />
    </AppShell>
  )
}
