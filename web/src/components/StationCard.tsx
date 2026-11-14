import { useEffect, useState } from 'react'
import { bearingDeg, distanceM, walkHomeS } from '../lib/helpers'
import { useInteraction } from '../map/interaction'
import { useData, type Photo } from '../state/data'
import { usePlan } from '../state/plan'
import { DASH, fmtBearing, fmtDistance, fmtDuration } from './format'

function StationPhoto({ photo, stationName }: { photo: Photo; stationName: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="space-y-1">
      {failed ? (
        <div className="flex h-24 items-center justify-center rounded border border-line bg-panel-2 text-xs text-fg-muted">
          Photo not available yet
        </div>
      ) : (
        <img
          src={photo.url}
          alt={`Rover photo near ${stationName}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-24 w-full rounded border border-line object-cover"
        />
      )}
      <figcaption className="text-[10px] leading-tight text-fg-muted">
        {photo.camera} · sol {photo.sol} · {photo.credit}
      </figcaption>
    </figure>
  )
}

/** Walk-home time is not reactive in the plan slice, so check again until the field has arrived. */
function useWalkHome(lat: number, lon: number): number {
  const result = usePlan((s) => s.result)
  const [, tick] = useState(0)
  const value = walkHomeS({ lat, lon })
  useEffect(() => {
    if (!Number.isNaN(value)) return
    const id = setInterval(() => tick((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [value, result])
  return value
}

function Card({ id }: { id: string }) {
  const stations = useData((s) => s.stations)
  const select = useInteraction((s) => s.selectStation)
  const station = stations.find((s) => s.id === id)
  const base = stations[0]
  const walkHome = useWalkHome(station?.lat ?? NaN, station?.lon ?? NaN)
  if (!station || !base) return null

  const here = { lat: station.lat, lon: station.lon }
  const from = { lat: base.lat, lon: base.lon }
  const walkHomeText = Number.isNaN(walkHome) ? 'calculating…' : walkHome === Infinity ? 'no path' : fmtDuration(walkHome)

  return (
    <div
      data-map-obstacle
      className="absolute left-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-72 space-y-3 overflow-y-auto rounded-md border border-line bg-panel/95 p-3 text-sm text-fg shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">
          {station.id} · {station.name}
        </h2>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Close station card"
          className="rounded border border-line px-2 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </div>
      <p>{station.task}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">Range from base</dt>
        <dd className="font-mono">{fmtDistance(distanceM(from, here))}</dd>
        <dt className="text-fg-muted">Bearing from base</dt>
        <dd className="font-mono">{fmtBearing(bearingDeg(from, here))}</dd>
        <dt className="text-fg-muted">Walk home</dt>
        <dd className="font-mono">{walkHomeText}</dd>
        <dt className="text-fg-muted">Time at station</dt>
        <dd className="font-mono">{station.dwellS > 0 ? fmtDuration(station.dwellS) : DASH}</dd>
      </dl>
      <p className="text-[10px] leading-tight text-fg-muted">
        Range and bearing: straight line on the Mars sphere from the station list. Walk home: route model.
        {station.sol !== null ? ` Position taken from rover sol ${station.sol}.` : ' Position has no rover source.'}
      </p>
      {station.photos.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          {station.photos.slice(0, 3).map((p, i) => (
            <StationPhoto key={`${p.url}-${i}`} photo={p} stationName={station.name} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-muted">No rover photos for this station.</p>
      )}
    </div>
  )
}

export default function StationCard() {
  const id = useInteraction((s) => s.selectedStationId)
  const loaded = useData((s) => s.loaded)
  const select = useInteraction((s) => s.selectStation)

  useEffect(() => {
    if (id === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, select])

  return loaded && id !== null ? <Card id={id} /> : null
}
