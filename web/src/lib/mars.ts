/**
 * Distance and bearing on Mars. MapLibre's own distance tools assume Earth, so never use them for numbers.
 * The radius is passed in, read from assumptions.json (`mars_radius_m`), never typed into code.
 */

export type LatLon = { lat: number; lon: number }

const DEG = Math.PI / 180

/** Great-circle distance between two points, in metres, on a sphere of `radiusM` metres (haversine). */
export function distanceM(a: LatLon, b: LatLon, radiusM: number): number {
  const dLat = (b.lat - a.lat) * DEG
  const dLon = (b.lon - a.lon) * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from `from` to `to`, in degrees clockwise from north, 0 to 360 (360 itself is returned as 0). */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const lat1 = from.lat * DEG
  const lat2 = to.lat * DEG
  const dLon = (to.lon - from.lon) * DEG
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const deg = Math.atan2(y, x) / DEG
  return ((deg % 360) + 360) % 360
}
