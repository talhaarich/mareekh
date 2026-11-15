import { useEffect, useState } from 'react'
import AppShell, { type ShellPanel } from './components/AppShell'
import EvaScreen from './components/EvaScreen'
import FieldNotes from './components/FieldNotes'
import UiIcon from './components/icons'
import LayerControls from './components/LayerControls'
import RightPanel from './components/RightPanel'
import { RIGHT_PANELS } from './components/rightPanels'
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

  const leftPanels: ShellPanel[] = [
    { id: 'view', label: 'Map view', icon: <UiIcon name="view" />, content: <LayerControls part="view" /> },
    { id: 'reach', label: 'Reach from base', icon: <UiIcon name="reach" />, content: <LayerControls part="reach" /> },
    { id: 'overlay', label: 'Data overlay', icon: <UiIcon name="overlay" />, content: <LayerControls part="overlay" /> },
    { id: 'notes', label: 'Field notes', icon: <UiIcon name="notes" />, content: <FieldNotes /> },
  ]
  const rightPanels: ShellPanel[] = RIGHT_PANELS.map((p) => ({
    id: p.id,
    label: p.label,
    icon: <UiIcon name={p.id} />,
    content: <RightPanel panel={p.id} />,
  }))

  return (
    <>
      <AppShell
        leftPanels={leftPanels}
        rightPanels={rightPanels}
        regionName={manifest?.region.name}
        notice={loadError ? `Data could not be loaded: ${loadError}` : undefined}
      >
        <MissionMap />
      </AppShell>
      <RouteCard />
    </>
  )
}
