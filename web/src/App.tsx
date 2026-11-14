import Map, { Layer, Source } from 'react-map-gl/maplibre'
import type { Feature, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre looks for its worker next to its own module, which Vite's dependency
// pre-bundling moves. Without the worker, GeoJSON sources never draw. Point at it explicitly,
// and pass this same instance to <Map mapLib> so react-map-gl doesn't load a second copy
// (a second copy would never see this setting).
maplibregl.setWorkerUrl(maplibreWorkerUrl)

// Placeholder colours until Rafay's design tokens land.
const DARK_BASE = '#0b0e14'
const BRAND_ORANGE = '#f97316'

// Base site (CONTEXT.md). Temporary: will come from the data slice once the loader exists.
const BASE = { lat: 18.4446, lon: 77.4509 }

// There is no Mars basemap: a blank style with only a dark background.
const blankStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': DARK_BASE } }],
}

const baseFeature: Feature<Point> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Point', coordinates: [BASE.lon, BASE.lat] },
}

function App() {
  return (
    <div className="h-screen w-screen">
      <Map
        mapLib={maplibregl}
        initialViewState={{ latitude: BASE.lat, longitude: BASE.lon, zoom: 12 }}
        mapStyle={blankStyle}
        style={{ width: '100%', height: '100%' }}
      >
        <Source id="base" type="geojson" data={baseFeature}>
          <Layer
            id="base-dot"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': BRAND_ORANGE,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>
      </Map>
    </div>
  )
}

export default App
