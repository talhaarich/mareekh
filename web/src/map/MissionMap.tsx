import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import type { Feature, LineString, Polygon } from 'geojson'
import type { StyleSpecification } from 'maplibre-gl'
import PinEditor from '../components/PinEditor'
import StationCard from '../components/StationCard'
import { fmtDuration } from '../components/format'
import { dataUrl } from '../lib/dataUrl'
import { uncertaintyRing } from '../lib/helpers'
import { useData, type LegendItem } from '../state/data'
import { usePins } from '../state/pins'
import { usePlan } from '../state/plan'
import { usePosition } from '../state/position'
import { useView } from '../state/view'
import { useInteraction } from './interaction'
import { overlayLayers, resolveBaseView, viewLayers, type ImageLayer } from './layers'
import MapLabels, { type LabelItem } from './MapLabels'
import PinGlyph from './PinGlyph'
import PositionEdgeArrow from './PositionEdgeArrow'
import { pinLabelText, pinTypeLabel } from './pinLabels'
import { maplibregl } from './maplibreSetup'
import { readToken } from './tokens'
import { useLayerAvailability } from './useLayerAvailability'

/** Credit, caveat and colour key for one layer. Every layer shown must say where it came from. */
function KeyBlock({ title, layer, missing }: { title: string; layer: ImageLayer; missing: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-fg">
        <span className="text-fg-muted">{title}: </span>
        {layer.name}
        {missing && <span className="text-fg-muted"> (not shown)</span>}
      </div>
      {missing && <div className="text-fg">Picture not built yet. The data pipeline writes it.</div>}
      {layer.legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {layer.legend.map((entry: LegendItem) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border border-line"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
      <div className="text-fg-muted">Source: {layer.credit}</div>
      {layer.caveat !== '' && <div className="text-fg-muted">Note: {layer.caveat}</div>}
    </div>
  )
}

/** The planned route in the route colour. The leg under the pointer in the leg table is drawn thicker. */
function RouteLayer() {
  const result = usePlan((s) => s.result)
  const hoverLeg = useInteraction((s) => s.hoverLeg)
  const routeColor = useMemo(() => readToken('--color-route'), [])

  const data = useMemo(() => {
    const features: Feature<LineString>[] = []
    ;(result?.legs ?? []).forEach((leg, i) => {
      if (leg.ok && leg.path.length > 1) {
        features.push({
          type: 'Feature',
          properties: { i },
          geometry: { type: 'LineString', coordinates: leg.path.map((p) => [p.lon, p.lat]) },
        })
      }
    })
    return { type: 'FeatureCollection' as const, features }
  }, [result])

  return (
    <Source id="mm-route" type="geojson" data={data}>
      <Layer
        id="mm-route-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': routeColor, 'line-width': 3, 'line-opacity': hoverLeg === null ? 1 : 0.45 }}
      />
      <Layer
        id="mm-route-hover"
        type="line"
        filter={['==', ['get', 'i'], hoverLeg ?? -1]}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': routeColor, 'line-width': 7, 'line-opacity': 1 }}
      />
    </Source>
  )
}

/** The simulated position's uncertainty ring, in metres on Mars, drawn in the route colour. */
function UncertaintyRingLayer({ center, radiusM }: { center: { lat: number; lon: number }; radiusM: number }) {
  const routeColor = useMemo(() => readToken('--color-route'), [])
  const data = useMemo(() => {
    const ring = uncertaintyRing(center, radiusM)
    const features: Feature<Polygon>[] = ring ? [ring] : []
    return { type: 'FeatureCollection' as const, features }
  }, [center, radiusM])
  return (
    <Source id="mm-uncertainty" type="geojson" data={data}>
      <Layer id="mm-uncertainty-fill" type="fill" paint={{ 'fill-color': routeColor, 'fill-opacity': 0.15 }} />
      <Layer id="mm-uncertainty-line" type="line" paint={{ 'line-color': routeColor, 'line-width': 1.5, 'line-dasharray': [2, 2] }} />
    </Source>
  )
}

export default function MissionMap() {
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const manifest = useData((s) => s.manifest)
  const stations = useData((s) => s.stations)
  const available = useLayerAvailability((s) => s.available)
  const turnBack = usePlan((s) => s.result?.turnBack ?? null)
  const selectStation = useInteraction((s) => s.selectStation)
  const pins = usePins((s) => s.pins)
  const pinDropType = useInteraction((s) => s.pinDropType)
  const setPinDropType = useInteraction((s) => s.setPinDropType)
  const editPin = useInteraction((s) => s.editPin)
  const flyTarget = useInteraction((s) => s.flyTarget)
  const estimate = usePosition((s) => s.estimate)
  const uncertaintyM = usePosition((s) => s.uncertaintyM)
  // The position shows once a rehearsal has started (before that it sits on base).
  const walkStarted = usePosition((s) => s.elapsedS > 0 || s.fixes.length > 0)
  const showPosition = walkStarted && Number.isFinite(estimate.lat) && Number.isFinite(estimate.lon)

  const baseView = useView((s) => s.baseView)
  const overlay = useView((s) => s.overlay)
  const overlayStrength = useView((s) => s.overlayStrength)
  const showLabels = useView((s) => s.showLabels)

  const views = useMemo(() => viewLayers(manifest), [manifest])
  const overlays = useMemo(() => overlayLayers(manifest), [manifest])
  const activeView = resolveBaseView(views, baseView)
  const activeOverlay = overlays.find((o) => o.id === overlay) ?? null

  // There is no Mars basemap: a blank style with only a dark background (colour from tokens.css).
  const blankStyle = useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {},
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': readToken('--color-bg') } },
      ],
    }),
    [],
  )

  // Frame the region once both the map and the manifest are ready.
  useEffect(() => {
    if (!mapReady || !manifest) return
    const [south, west, north, east] = manifest.region.bounds
    mapRef.current?.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 48, duration: 0 },
    )
  }, [mapReady, manifest])

  // Esc leaves pin-drop mode.
  useEffect(() => {
    if (!pinDropType) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinDropType(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinDropType, setPinDropType])

  // Fly to a pin picked in the field-notes list.
  useEffect(() => {
    if (!mapReady || !flyTarget) return
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center: [flyTarget.lon, flyTarget.lat], zoom: Math.max(map.getZoom(), 14), duration: 800 })
  }, [mapReady, flyTarget])

  // Everything that gets a label: base, stations, pins, turn-back point.
  const labelItems = useMemo<LabelItem[]>(() => {
    const items: LabelItem[] = stations.map((s) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      text: `${s.id} · ${s.name}`,
      onSelect: s.id === 'B' ? undefined : () => selectStation(s.id),
    }))
    for (const p of pins) {
      items.push({ id: `pin-${p.id}`, lat: p.lat, lon: p.lon, text: pinLabelText(p), onSelect: () => editPin(p.id) })
    }
    if (showPosition) {
      items.push({ id: 'position', lat: estimate.lat, lon: estimate.lon, text: 'Simulated position' })
    }
    if (turnBack) {
      items.push({
        id: 'turnback',
        lat: turnBack.position.lat,
        lon: turnBack.position.lon,
        text: `Turn back by ${fmtDuration(turnBack.elapsedS)} (route model)`,
      })
    }
    return items
  }, [stations, pins, turnBack, selectStation, editPin, showPosition, estimate])

  const viewMissing = activeView !== null && available[activeView.id] === false

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={blankStyle}
        initialViewState={{ latitude: 18.4446, longitude: 77.4509, zoom: 11 }}
        attributionControl={false}
        cursor={pinDropType ? 'crosshair' : undefined}
        onClick={(e) => {
          if (!pinDropType) return
          const id = usePins.getState().addPin(pinDropType, { lat: e.lngLat.lat, lon: e.lngLat.lng })
          setPinDropType(null)
          editPin(id)
        }}
        onLoad={() => setMapReady(true)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Views first, then overlays, then the route, so each draws above the last. All stay
            mounted and are shown or hidden, so switching view never re-downloads a picture. */}
        {views
          .filter((v) => available[v.id] === true)
          .map((v) => (
            <Source key={v.id} id={`mm-src-${v.id}`} type="image" url={dataUrl(v.url)} coordinates={v.coordinates}>
              <Layer
                id={`mm-view-${v.id}`}
                type="raster"
                layout={{ visibility: v.id === activeView?.id ? 'visible' : 'none' }}
                paint={{ 'raster-fade-duration': 0 }}
              />
            </Source>
          ))}
        {overlays
          .filter((o) => available[o.id] === true)
          .map((o) => (
            <Source key={o.id} id={`mm-src-${o.id}`} type="image" url={dataUrl(o.url)} coordinates={o.coordinates}>
              <Layer
                id={`mm-overlay-${o.id}`}
                type="raster"
                layout={{ visibility: o.id === activeOverlay?.id ? 'visible' : 'none' }}
                paint={{ 'raster-opacity': overlayStrength, 'raster-fade-duration': 0 }}
              />
            </Source>
          ))}

        <RouteLayer />
        {showPosition && <UncertaintyRingLayer center={estimate} radiusM={uncertaintyM} />}

        {stations.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lon} anchor="center">
            {s.id === 'B' ? (
              <div
                role="img"
                aria-label="Base"
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-fg bg-brand text-[11px] font-bold text-bg"
              >
                B
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Open station card: ${s.id}, ${s.name}`}
                onClick={() => {
                  if (!pinDropType) selectStation(s.id)
                }}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-fg bg-panel text-[11px] font-bold text-fg"
              >
                {s.id}
              </button>
            )}
          </Marker>
        ))}

        {pins.map((p) => (
          <Marker key={p.id} latitude={p.lat} longitude={p.lon} anchor="center">
            <button
              type="button"
              aria-label={`Open note: ${pinTypeLabel(p.type)} pin`}
              onClick={() => {
                if (!pinDropType) editPin(p.id)
              }}
              className="block cursor-pointer"
            >
              <PinGlyph type={p.type} />
            </button>
          </Marker>
        ))}

        {turnBack && (
          <Marker latitude={turnBack.position.lat} longitude={turnBack.position.lon} anchor="center">
            <div
              role="img"
              aria-label="Turn-back point"
              className="h-4 w-4 rotate-45 border-2 border-caution bg-bg"
            />
          </Marker>
        )}

        {showPosition && (
          <Marker latitude={estimate.lat} longitude={estimate.lon} anchor="center">
            {/* Beacon: a DOM marker keeps the same pixel size at every zoom; the pulse makes it findable. */}
            <div role="img" aria-label="Simulated position" className="relative h-4 w-4">
              <span className="absolute -inset-2 animate-ping rounded-full border-2 border-route motion-reduce:hidden" />
              <span className="absolute -inset-1 rounded-full bg-route/25" />
              <span className="absolute inset-0 rounded-full border-2 border-fg bg-route" />
            </div>
          </Marker>
        )}

        <NavigationControl position="top-right" showCompass visualizePitch={false} />
      </MapGL>

      {showLabels && (
        <MapLabels
          mapRef={mapRef}
          containerRef={containerRef}
          ready={mapReady}
          items={labelItems}
        />
      )}

      <PositionEdgeArrow
        mapRef={mapRef}
        containerRef={containerRef}
        ready={mapReady}
        position={showPosition ? estimate : null}
        onSelect={() => mapRef.current?.flyTo({ center: [estimate.lon, estimate.lat], duration: 800 })}
      />

      <StationCard />
      <PinEditor />

      {pinDropType && (
        <div
          data-map-obstacle
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-fg-muted bg-panel/95 px-3 py-1.5 text-xs text-fg shadow"
        >
          Click the map to drop a {pinTypeLabel(pinDropType).toLowerCase()} pin · Esc cancels
        </div>
      )}

      {viewMissing && activeView && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-fg-muted">
          The {activeView.name} picture is not built yet. The data pipeline writes it.
        </div>
      )}

      {(activeView || activeOverlay) && (
        <div
          data-map-obstacle
          className="pointer-events-none absolute bottom-3 left-3 max-w-xs space-y-3 rounded-md border border-line bg-panel/90 p-3 text-xs text-fg-muted backdrop-blur"
        >
          {activeView && <KeyBlock title="View" layer={activeView} missing={available[activeView.id] === false} />}
          {activeOverlay && (
            <KeyBlock title="Overlay" layer={activeOverlay} missing={available[activeOverlay.id] === false} />
          )}
        </div>
      )}
    </div>
  )
}
