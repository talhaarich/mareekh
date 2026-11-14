import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { dataUrl } from '../lib/dataUrl'
import { useView } from '../state/view'
import type { ImageLayer, LegendEntry } from './dataTypes'
import { overlayLayers, resolveBaseView, viewLayers } from './layers'
import { maplibregl } from './maplibreSetup'
import { readToken } from './tokens'
import { useMissionData } from './useMissionData'

/** Credit, caveat and colour key for one layer. Every layer shown must say where it came from. */
function KeyBlock({ title, layer }: { title: string; layer: ImageLayer }) {
  return (
    <div className="space-y-1">
      <div className="text-fg">
        <span className="text-fg-muted">{title}: </span>
        {layer.name}
      </div>
      {layer.legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {layer.legend.map((entry: LegendEntry) => (
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

export default function MissionMap() {
  const mapRef = useRef<MapRef | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const manifest = useMissionData((s) => s.manifest)
  const stations = useMissionData((s) => s.stations)
  const available = useMissionData((s) => s.available)

  const baseView = useView((s) => s.baseView)
  const overlay = useView((s) => s.overlay)
  const overlayStrength = useView((s) => s.overlayStrength)

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

  const viewMissing = activeView !== null && available[activeView.id] === false

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={blankStyle}
        initialViewState={{ latitude: 18.4446, longitude: 77.4509, zoom: 11 }}
        attributionControl={false}
        onLoad={() => setMapReady(true)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Views first, then overlays, so overlays always draw on top. All stay mounted and are
            shown or hidden, so switching view never re-downloads a picture or reorders layers. */}
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

        {manifest && (
          <Marker latitude={manifest.region.base.lat} longitude={manifest.region.base.lon} anchor="center">
            <div
              role="img"
              aria-label="Base"
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-fg bg-brand text-[11px] font-bold text-bg"
            >
              B
            </div>
          </Marker>
        )}

        {stations
          .filter((s) => s.id !== 'B')
          .map((s) => (
            <Marker key={s.id} latitude={s.lat} longitude={s.lon} anchor="center">
              <div
                role="img"
                aria-label={`${s.id}: ${s.name}`}
                title={`${s.id}: ${s.name}`}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-fg bg-panel text-[11px] font-bold text-fg"
              >
                {s.id}
              </div>
            </Marker>
          ))}

        <NavigationControl position="top-right" showCompass visualizePitch={false} />
      </MapGL>

      {viewMissing && activeView && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-fg-muted">
          The {activeView.name} picture is not built yet. The data pipeline writes it.
        </div>
      )}

      {(activeView || activeOverlay) && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs space-y-3 rounded-md border border-line bg-panel/90 p-3 text-xs text-fg-muted backdrop-blur">
          {activeView && <KeyBlock title="View" layer={activeView} />}
          {activeOverlay && <KeyBlock title="Overlay" layer={activeOverlay} />}
        </div>
      )}
    </div>
  )
}
