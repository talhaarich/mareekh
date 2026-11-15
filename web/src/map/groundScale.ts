/**
 * True vertical scale for 3D. MapLibre draws our Mars latitudes and longitudes on an Earth-sized sphere,
 * so every horizontal distance on the map is R_earth / R_mars (about 1.876) times too big, while
 * heights from the terrain tiles are drawn as plain metres. Stretching heights (and anything else we
 * hand MapLibre in metres: camera altitude, eye height) by the same factor puts them back in proportion.
 */

/**
 * The Earth radius MapLibre measures its world with, in metres: `earthRadius` in maplibre-gl 6.18
 * (src/geo/lng_lat.ts). It is not exported, so it is repeated here; groundScale.test.ts checks it
 * against MapLibre's own LngLat.distanceTo, so an upgrade that changes it fails the tests.
 */
export const EARTH_RADIUS_M = 6371008.8

/** How many MapLibre metres one Mars metre is drawn as. `marsRadiusM` comes from assumptions.json (mars_radius_m). */
export function trueScaleFactor(marsRadiusM: number): number {
  return EARTH_RADIUS_M / marsRadiusM
}

/** A Mars height or distance in metres, as the metres MapLibre must be given. */
export function marsToMapM(marsM: number, factor: number): number {
  return marsM * factor
}

/** A MapLibre altitude or distance back in Mars metres. */
export function mapToMarsM(mapM: number, factor: number): number {
  return mapM / factor
}

/**
 * Readout for the vertical exaggeration control: the MapLibre exaggeration `x` relative to true scale.
 * At true scale (within 1 %) it says so; otherwise e.g. "1.3×".
 */
export function exaggerationLabel(x: number, factor: number): string {
  const relative = x / factor
  if (Math.abs(relative - 1) < 0.01) return '1× (true scale)'
  return `${relative.toFixed(1)}×`
}

/** MapLibre's world is 512 px wide at zoom 0. */
const MAPLIBRE_TILE_PX = 512

/**
 * MapLibre's camera-to-center distance in MapLibre metres at `zoom`: half the canvas height / tan(half the
 * vertical field of view) pixels, at the Mercator scale of latitude `lat`. The inverse of how MapLibre turns a
 * camera distance into a zoom, so choosing this distance chooses MapLibre's zoom.
 */
export function centerDistanceM(zoom: number, lat: number, fovDeg: number, heightPx: number): number {
  const rad = Math.PI / 180
  const metresPerPx = (2 * Math.PI * EARTH_RADIUS_M * Math.cos(lat * rad)) / (MAPLIBRE_TILE_PX * 2 ** zoom)
  return (heightPx / 2 / Math.tan((fovDeg * rad) / 2)) * metresPerPx
}

/**
 * Where MapLibre's camera is, from the view it reports: the same geometry MapLibre uses (camera to center
 * distance = half the canvas height / tan(half the vertical field of view), in pixels at the center's
 * Mercator scale). Needed because maplibre-gl 6.18 keeps its camera position internal.
 * Distances and altitude are MapLibre (Earth-scale) metres; `centerElevationM` is map.getCameraTargetElevation().
 */
export function cameraPosition(v: {
  center: { lat: number; lon: number }
  zoom: number
  pitchDeg: number
  bearingDeg: number
  centerElevationM: number
  fovDeg: number
  heightPx: number
}): { lat: number; lon: number; altM: number } {
  const rad = Math.PI / 180
  const distM = centerDistanceM(v.zoom, v.center.lat, v.fovDeg, v.heightPx)
  const back = distM * Math.sin(v.pitchDeg * rad) // camera stands behind the center, against the bearing
  const b = (v.bearingDeg + 180) * rad
  const lat = v.center.lat + (back * Math.cos(b)) / EARTH_RADIUS_M / rad
  const lon = v.center.lon + (back * Math.sin(b)) / (EARTH_RADIUS_M * Math.cos(v.center.lat * rad)) / rad
  return { lat, lon, altM: v.centerElevationM + distM * Math.cos(v.pitchDeg * rad) }
}
