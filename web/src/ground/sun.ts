/**
 * Approximate sun direction for a local solar time, pure. Uses the latitude (DATA) and a declination
 * (constants.ts: the season is not modelled). Mars hours: the sun moves 15° of hour angle per local hour.
 */

const RAD = Math.PI / 180

export interface Sun {
  /** Degrees above the horizon (negative below). */
  elevationDeg: number
  /** Degrees clockwise from north. */
  azimuthDeg: number
  /** Unit vector towards the sun: east, north, up. */
  east: number
  north: number
  up: number
}

export function sunDirection(localHour: number, latDeg: number, declinationDeg: number): Sun {
  const h = (localHour - 12) * 15 * RAD // hour angle, positive in the afternoon
  const lat = latDeg * RAD
  const dec = declinationDeg * RAD
  // Unit vector to the sun in east-north-up axes.
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h)
  const east = -Math.cos(dec) * Math.sin(h)
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h)
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, up))) / RAD
  const azimuthDeg = ((Math.atan2(east, north) / RAD) % 360 + 360) % 360
  return { elevationDeg, azimuthDeg, east, north, up }
}
