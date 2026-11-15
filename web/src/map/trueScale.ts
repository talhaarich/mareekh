/**
 * True vertical scale for 3D. MapLibre draws our Mars latitudes and longitudes on an Earth-sized sphere,
 * so every horizontal distance on the map is R_earth / R_mars (about 1.876) times too big, while heights
 * from the terrain tiles are drawn as plain metres. An exaggeration equal to that factor puts heights back
 * in proportion; the 3D control shows its setting relative to it.
 */

/**
 * The Earth radius MapLibre measures its world with, in metres: `earthRadius` in maplibre-gl 6.18
 * (src/geo/lng_lat.ts). It is not exported, so it is repeated here; trueScale.test.ts checks it
 * against MapLibre's own LngLat.distanceTo, so an upgrade that changes it fails the tests.
 */
export const EARTH_RADIUS_M = 6371008.8

/** How many MapLibre metres one Mars metre is drawn as. `marsRadiusM` comes from assumptions.json (mars_radius_m). */
export function trueScaleFactor(marsRadiusM: number): number {
  return EARTH_RADIUS_M / marsRadiusM
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

