import { useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import EvaScreen from './components/EvaScreen'
import FieldNotes from './components/FieldNotes'
import LayerControls from './components/LayerControls'
import RightPanel from './components/RightPanel'
import RouteCard from './components/RouteCard'
import { usePlanner } from './components/planParams'
import { useWalkClock } from './components/walkClock'
import MissionMap from './map/MissionMap'
import { useLayerAvailability } from './map/useLayerAvailability'
import { useData } from './state/data'
import { useView } from './state/view'

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

  // Both run above the two screens, so planning and the rehearsal clock carry on in EVA mode.
  usePlanner()
  useWalkClock()

  const mode = useView((s) => s.mode)
  if (mode === 'eva') return <EvaScreen />

  return (
    <>
      <AppShell
        left={
          <div className="space-y-8">
            <LayerControls />
            <FieldNotes />
          </div>
        }
        right={<RightPanel />}
        regionName={manifest?.region.name}
        notice={loadError ? `Data could not be loaded: ${loadError}` : undefined}
      >
        <MissionMap />
      </AppShell>
      <RouteCard />
    </>
  )
}
