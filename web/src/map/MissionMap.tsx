import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import type { Feature, LineString, Polygon } from 'geojson'
import type { StyleSpecification } from 'maplibre-gl'
import Inspector from '../components/Inspector'
import PinEditor from '../components/PinEditor'
import StationCard from '../components/StationCard'
import { defaultStops, useWalkStops } from '../components/walkStops'
import { fmtDuration } from '../components/format'
import { dataUrl } from '../lib/dataUrl'
import { uncertaintyRing } from '../lib/helpers'
import { useData, type LegendItem } from '../state/data'
import { usePins } from '../state/pins'
import { usePlan } from '../state/plan'
import { usePosition } from '../state/position'
import { useView } from '../state/view'
import { ANCHOR_BACKDROP, ANCHOR_DATA, ANCHOR_OVERLAYS } from './anchors'
import { CAMERA_PRESETS } from './cameraPresets'
import { groundSwallowsClick, isGroundRestoring } from './groundFlags'
import { GroundOverlay, GroundViewController } from './GroundView'
import { addRouteArrow, ROUTE_ARROW } from './routeArrow'
import { useInteraction } from './interaction'
import { overlayLayers, resolveBaseView, viewLayers, type ImageLayer } from './layers'
import MapLabels, { type LabelItem } from './MapLabels'
import PinGlyph from './PinGlyph'
import PositionEdgeArrow from './PositionEdgeArrow'
import { useReachLabels } from './reach'
import ReachLayer, { ReachKeyBlock } from './ReachLayer'
import SlopeGridLayer, { SLOPE_OVERLAY_ID, SlopeKeyBlock } from './SlopeGridLayer'
import { pinLabelText, pinTypeLabel } from './pinLabels'
import { maplibregl } from './maplibreSetup'
import { readToken } from './tokens'
import { useTerrainSource } from './terrain'
import TurnTiltControls from './TurnTiltControls'
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
function RouteLayer({ arrows }: { arrows: boolean }) {
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
      {/* Soft glow under the line: reads well over dark ground and in 3D. */}
      <Layer
        id="mm-route-glow"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': routeColor, 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.35 }}
      />
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
      {/* Direction of walk; the image is registered in onLoad, before this layer can mount. */}
      {arrows && (
        <Layer
          id="mm-route-arrows"
          type="symbol"
          layout={{
            'symbol-placement': 'line',
            'symbol-spacing': 110,
            'icon-image': ROUTE_ARROW,
            'icon-size': 0.95,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-rotation-alignment': 'map',
          }}
        />
      )}
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
  const legs = usePlan((s) => s.result?.legs)
  const routePaths = useMemo(() => (legs ?? []).filter((l) => l.ok).map((l) => l.path), [legs])
  const [keyOpen, setKeyOpen] = useState(true)
  const selectStation = useInteraction((s) => s.selectStation)
  const pins = usePins((s) => s.pins)
  const included = useWalkStops((s) => s.included)
  const inWalk = useMemo(() => new Set(included ?? defaultStops(stations)), [stations, included])
  const pinDropType = useInteraction((s) => s.pinDropType)
  const setPinDropType = useInteraction((s) => s.setPinDropType)
  const editPin = useInteraction((s) => s.editPin)
  const flyTarget = useInteraction((s) => s.flyTarget)
  const inspectAt = useInteraction((s) => s.inspectAt)
  const setInspectAt = useInteraction((s) => s.setInspectAt)
  const estimate = usePosition((s) => s.estimate)
  const uncertaintyM = usePosition((s) => s.uncertaintyM)
  // The position shows once a rehearsal has started (before that it sits on base).
  const walkStarted = usePosition((s) => s.elapsedS > 0 || s.fixes.length > 0)
  const showPosition = walkStarted && Number.isFinite(estimate.lat) && Number.isFinite(estimate.lon)

  const baseView = useView((s) => s.baseView)
  const overlay = useView((s) => s.overlay)
  const overlayStrength = useView((s) => s.overlayStrength)
  const showLabels = useView((s) => s.showLabels)
  const reach = useView((s) => s.reach)
  const reachLabels = useReachLabels()
  const terrain3d = useView((s) => s.terrain3d)
  const exaggeration = useView((s) => s.exaggeration)
  const dem = useTerrainSource(manifest)
  const terrainOn = terrain3d && dem !== null

  // Ground view ("Stand here"): needs the 3D height tiles and the height grid.
  const groundOn = useInteraction((s) => s.ground !== null)
  const gridLoaded = useData((s) => s.grid !== null)
  const setGroundAvailable = useInteraction((s) => s.setGroundAvailable)
  useEffect(() => setGroundAvailable(dem !== null && gridLoaded), [dem, gridLoaded, setGroundAvailable])
  const groundWas = useRef(groundOn)

  // Sky, fog and hillshade colours from tokens.css (MapLibre paints on a canvas, so no CSS variables).
  const look = useMemo(
    () => ({
      sky: {
        'sky-color': readToken('--color-sky'),
        'horizon-color': readToken('--color-horizon'),
        'fog-color': readToken('--color-fog'),
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.7,
        'fog-ground-blend': 0.9,
        'atmosphere-blend': 0,
      },
      relief: [1, 2, 3, 4].map((i) => readToken(`--color-relief-${i}`)),
      shadow: readToken('--color-shade-dark'),
      highlight: readToken('--color-shade-light'),
    }),
    [],
  )

  // 3D opens looking along the delta front; 2D goes flat and frames the walk box again.
  const cameraPreset = useInteraction((s) => s.cameraPreset)
  const setCameraPreset = useInteraction((s) => s.setCameraPreset)
  useEffect(() => {
    const map = mapRef.current
    // The ground view moves the camera itself, and puts it back (2D/3D setting included) when it ends.
    const groundChanged = groundWas.current !== groundOn
    groundWas.current = groundOn
    if (!mapReady || !map || groundOn || groundChanged || isGroundRestoring()) return
    if (terrainOn) {
      setCameraPreset('delta')
    } else if (manifest) {
      const [s, w, n, e] = manifest.region.bounds
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
      map.fitBounds([[w, s], [e, n]], { padding: 48, duration: 800, pitch: 0, bearing: 0 })
    }
  }, [mapReady, terrainOn, manifest, setCameraPreset, groundOn])
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !cameraPreset || useInteraction.getState().ground) return
    const p = CAMERA_PRESETS[cameraPreset.name]
    map.flyTo({ center: p.center, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, duration: 2200, essential: true })
  }, [mapReady, cameraPreset])

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
        // Hidden anchors that fix the drawing order, whatever order layers mount in (pictures mount
        // late, after their availability check): views < overlays < everything else (route, ring, ...).
        { id: ANCHOR_BACKDROP, type: 'background', layout: { visibility: 'none' } },
        { id: ANCHOR_OVERLAYS, type: 'background', layout: { visibility: 'none' } },
        { id: ANCHOR_DATA, type: 'background', layout: { visibility: 'none' } },
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
    if (!mapReady || !flyTarget || useInteraction.getState().ground) return
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
      text: s.name,
      onSelect: () => selectStation(s.id),
    }))
    for (const p of pins) {
      items.push({ id: `pin-${p.id}`, lat: p.lat, lon: p.lon, text: pinLabelText(p), onSelect: () => editPin(p.id) })
    }
    items.push(...reachLabels)
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
  }, [stations, pins, turnBack, selectStation, editPin, showPosition, estimate, reachLabels])

  const viewMissing = activeView !== null && available[activeView.id] === false

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={blankStyle}
        initialViewState={{ latitude: 18.4446, longitude: 77.4509, zoom: 11 }}
        attributionControl={false}
        maxPitch={80}
        terrain={terrainOn ? { source: 'mm-dem', exaggeration } : undefined}
        sky={terrainOn ? look.sky : undefined}
        cursor={pinDropType ? 'crosshair' : undefined}
        onClick={(e) => {
          if (groundSwallowsClick()) return // that click skipped the ground-view flight
          if (pinDropType) {
            const id = usePins.getState().addPin(pinDropType, { lat: e.lngLat.lat, lon: e.lngLat.lng })
            setPinDropType(null)
            editPin(id)
            return
          }
          // A click on a marker (station, pin, position) is that marker's, not the inspector's.
          const target = e.originalEvent.target as Element | null
          if (target?.closest('.maplibregl-marker')) return
          setInspectAt({ lat: e.lngLat.lat, lon: e.lngLat.lng })
        }}
        onLoad={(e) => {
          addRouteArrow(e.target)
          setMapReady(true)
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Views sit below ANCHOR_OVERLAYS, overlays below ANCHOR_DATA, and the route and the rest
            on top, whatever order they mount in. All stay mounted and are shown or hidden, so
            switching view never re-downloads a picture. */}
        {views
          .filter((v) => available[v.id] === true)
          .map((v) => (
            <Source key={v.id} id={`mm-src-${v.id}`} type="image" url={dataUrl(v.url)} coordinates={v.coordinates}>
              <Layer
                id={`mm-view-${v.id}`}
                beforeId={ANCHOR_OVERLAYS}
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
                beforeId={ANCHOR_DATA}
                type="raster"
                layout={{ visibility: o.id === activeOverlay?.id ? 'visible' : 'none' }}
                paint={{ 'raster-opacity': overlayStrength, 'raster-fade-duration': 0 }}
              />
            </Source>
          ))}

        {/* One height source for 3D terrain, a second for the crater-wide relief shading under the
            pictures, in 2D and 3D (MapLibre's advice: separate sources). Both stay mounted. */}
        {dem && (
          <Source
            id="mm-dem"
            type="raster-dem"
            tiles={dem.tiles}
            tileSize={256}
            encoding={dem.encoding}
            minzoom={dem.minzoom}
            maxzoom={dem.maxzoom}
            bounds={dem.bounds}
          />
        )}
        {dem && (
          <Source
            id="mm-dem-shade"
            type="raster-dem"
            tiles={dem.tiles}
            tileSize={256}
            encoding={dem.encoding}
            minzoom={dem.minzoom}
            maxzoom={dem.maxzoom}
            bounds={dem.bounds}
          >
            {dem.heightRangeM && (
              <Layer
                id="mm-relief"
                type="color-relief"
                beforeId={ANCHOR_BACKDROP}
                paint={{
                  'color-relief-color': [
                    'interpolate',
                    ['linear'],
                    ['elevation'],
                    ...look.relief.flatMap((c, i) => [
                      dem.heightRangeM![0] + ((dem.heightRangeM![1] - dem.heightRangeM![0]) * i) / (look.relief.length - 1),
                      c,
                    ]),
                  ],
                }}
              />
            )}
            <Layer
              id="mm-hillshade"
              type="hillshade"
              beforeId={ANCHOR_BACKDROP}
              paint={{
                'hillshade-shadow-color': look.shadow,
                'hillshade-highlight-color': look.highlight,
                'hillshade-accent-color': look.shadow,
                'hillshade-exaggeration': 0.6,
                'hillshade-illumination-direction': 315,
              }}
            />
          </Source>
        )}

        <SlopeGridLayer visible={overlay === SLOPE_OVERLAY_ID} opacity={overlayStrength} />
        <ReachLayer />

        <RouteLayer arrows={mapReady} />
        {showPosition && <UncertaintyRingLayer center={estimate} radiusM={uncertaintyM} />}

        {stations.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lon} anchor="center">
            {s.id === 'B' ? (
              <button
                type="button"
                aria-label="Open station card: Base"
                onClick={() => {
                  if (!pinDropType) selectStation(s.id)
                }}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[3px] border-2 border-fg bg-brand font-mono text-[11px] font-bold text-bg shadow-[0_0_0_2px] shadow-bg"
              >
                B
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Open station card: ${s.id}, ${s.name}`}
                onClick={() => {
                  if (!pinDropType) selectStation(s.id)
                }}
                className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  inWalk.has(s.id)
                    ? 'border-2 border-bg bg-fg text-bg shadow-[0_0_0_2px] shadow-fg/40'
                    : 'border-2 border-dashed border-fg/80 bg-bg/80 text-fg'
                }`}
                title={inWalk.has(s.id) ? undefined : 'Optional destination: open its card to add it to the walk'}
              >
                {s.id.replace(/^S/, '')}
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

        {inspectAt && (
          // Above the label layer (z-10): a destination label must never sit on top of the card.
          <Marker latitude={inspectAt.lat} longitude={inspectAt.lon} anchor="bottom" offset={[0, -6]} style={{ zIndex: 20 }}>
            <Inspector />
          </Marker>
        )}
        {inspectAt && (
          <Marker latitude={inspectAt.lat} longitude={inspectAt.lon} anchor="center">
            <div role="img" aria-label="Inspected point" className="h-2.5 w-2.5 rounded-full border-2 border-fg bg-bg" />
          </Marker>
        )}

        {/* Hidden in the ground view: zooming would move the viewer off the spot they stand on. */}
        {!groundOn && <NavigationControl position="top-right" showCompass visualizePitch />}
      </MapGL>

      {/* The screen-space labels are off in the ground view; station and base markers stay. */}
      {showLabels && !groundOn && (
        <MapLabels
          mapRef={mapRef}
          containerRef={containerRef}
          ready={mapReady}
          items={labelItems}
          avoidLines={routePaths}
          relayoutKey={`${keyOpen}-${inspectAt?.lat}-${inspectAt?.lon}`}
        />
      )}

      {/* Under the zoom buttons; hidden in the ground view, which has its own drag-to-look. */}
      {!groundOn && <TurnTiltControls mapRef={mapRef} />}

      <PositionEdgeArrow
        mapRef={mapRef}
        containerRef={containerRef}
        ready={mapReady}
        position={showPosition ? estimate : null}
        onSelect={() => {
          if (!useInteraction.getState().ground) mapRef.current?.flyTo({ center: [estimate.lon, estimate.lat], duration: 800 })
        }}
      />

      <GroundViewController mapRef={mapRef} ready={mapReady} />
      <GroundOverlay />

      <StationCard />
      <PinEditor />

      {pinDropType && (
        <div
          data-map-obstacle
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-fg-muted bg-panel/95 px-3 py-1.5 text-xs text-fg shadow"
        >
          Click the map to drop a {pinTypeLabel(pinDropType).toLowerCase()} pin · Esc cancels
        </div>
      )}

      {viewMissing && activeView && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-fg-muted">
          The {activeView.name} picture is not built yet. The data pipeline writes it.
        </div>
      )}

      {(activeView || activeOverlay || overlay === SLOPE_OVERLAY_ID || reach !== 'off') &&
        (!keyOpen ? (
          <button
            type="button"
            data-map-obstacle
            onClick={() => setKeyOpen(true)}
            aria-expanded={false}
            className="absolute bottom-3 left-3 z-20 rounded-[3px] border border-line bg-panel/90 px-3 py-1.5 text-xs font-medium text-fg backdrop-blur hover:border-fg-muted"
          >
            Map key ▸
          </button>
        ) : (
        <div
          data-map-obstacle
          className="absolute bottom-3 left-3 z-20 max-h-[55%] max-w-xs space-y-3 overflow-y-auto rounded-md border border-line bg-panel/90 p-3 text-xs text-fg-muted backdrop-blur"
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-fg">Map key</span>
            <button
              type="button"
              onClick={() => setKeyOpen(false)}
              aria-expanded
              className="rounded-[3px] border border-line px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg"
            >
              Hide ▾
            </button>
          </div>
          {activeView && <KeyBlock title="View" layer={activeView} missing={available[activeView.id] === false} />}
          {activeOverlay && (
            <KeyBlock title="Overlay" layer={activeOverlay} missing={available[activeOverlay.id] === false} />
          )}
          {overlay === SLOPE_OVERLAY_ID && <SlopeKeyBlock />}
          {reach !== 'off' && <ReachKeyBlock />}
        </div>
        ))}
    </div>
  )
}
