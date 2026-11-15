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

  // Each panel: a short caption under its icon, a longer tooltip, and a first line saying what it is for.
  const leftPanels: ShellPanel[] = [
    {
      id: 'view',
      label: 'Map view',
      caption: 'Views',
      tip: 'Base map (satellite, relief, topo, elevation), 2D or 3D, labels',
      intro: 'Choose the base map, switch between 2D and 3D, and turn the labels on or off.',
      icon: <UiIcon name="view" />,
      content: <LayerControls part="view" />,
    },
    {
      id: 'reach',
      label: 'Reach from base',
      caption: 'Reach',
      tip: 'Shade how far the crew can get from base',
      intro: 'Shade how far the crew can get from base, by straight-line distance or by walking time.',
      icon: <UiIcon name="reach" />,
      content: <LayerControls part="reach" />,
    },
    {
      id: 'overlay',
      label: 'Data overlay',
      caption: 'Overlays',
      tip: 'One data layer over the map: minerals, geology or slope',
      intro: 'Lay one data layer over the map, such as minerals, rock units or the slope the planner uses.',
      icon: <UiIcon name="overlay" />,
      content: <LayerControls part="overlay" />,
    },
    {
      id: 'notes',
      label: 'Field notes',
      caption: 'Notes',
      tip: 'Drop hazard, sample and feature pins on the map',
      intro: 'Drop pins for hazards, samples and features. They are kept in this browser.',
      icon: <UiIcon name="notes" />,
      content: <FieldNotes />,
    },
  ]
  const rightText: Record<(typeof RIGHT_PANELS)[number]['id'], { caption: string; tip: string; intro: string }> = {
    plan: {
      caption: 'Plan',
      tip: 'Go or no-go, the totals, and the slope limit, load and time limit the walk is planned with',
      intro: 'Is the walk a go? The verdict, the totals, and the settings the route is planned with.',
    },
    route: { caption: 'Route', tip: 'Each leg of the walk: distance, time and climb', intro: 'Each leg of the walk, with its distance, time and climb.' },
    stops: {
      caption: 'Stops',
      tip: 'Choose the places the walk visits',
      intro: 'Tick places to add them to the walk. The plan updates at once.',
    },
    rehearse: {
      caption: 'Rehearse',
      tip: 'Play the walk with a simulated clock and position',
      intro: 'Play the walk on the map with a simulated clock, and confirm position fixes at the stops.',
    },
    safety: {
      caption: 'Safety',
      tip: 'Radiation dose, dust and weather, with sources',
      intro: 'Radiation dose, dust and weather for the walk, each with where the number comes from.',
    },
    limits: {
      caption: 'Limits',
      tip: 'What this map cannot tell you, and the team assumptions',
      intro: "What this map cannot tell you, and which numbers are the team's own assumptions.",
    },
  }
  const rightPanels: ShellPanel[] = RIGHT_PANELS.map((p) => ({
    id: p.id,
    label: p.label,
    ...rightText[p.id],
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
