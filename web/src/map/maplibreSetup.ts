import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre looks for its worker next to its own module, which Vite's dependency pre-bundling moves.
// Without the worker, GeoJSON sources never draw. Point at it explicitly, and pass this same
// instance to <Map mapLib> so react-map-gl doesn't load a second copy (it would never see this).
maplibregl.setWorkerUrl(maplibreWorkerUrl)

export { maplibregl }
