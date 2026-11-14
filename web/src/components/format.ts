/**
 * Display formatting. Code and data use m, s, kJ, mSv (CONVENTIONS.md); conversion happens only here.
 * Anything not finite (a leg with no path has Infinity) shows as a dash.
 */
export const DASH = '—'

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return DASH
  const totalMin = Math.round(Math.abs(seconds) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** Negative values keep their sign, so spare time below zero reads as over the limit. */
export function fmtSignedDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return DASH
  return seconds < 0 ? `−${fmtDuration(seconds)}` : fmtDuration(seconds)
}

export function fmtDistance(metres: number): string {
  if (!Number.isFinite(metres)) return DASH
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
}

export function fmtEnergy(kJ: number): string {
  return Number.isFinite(kJ) ? `${(kJ / 1000).toFixed(2)} MJ` : DASH
}

export function fmtDose(mSv: number): string {
  return Number.isFinite(mSv) ? `${mSv.toFixed(2)} mSv` : DASH
}

export function fmtBearing(deg: number): string {
  return Number.isFinite(deg) ? `${Math.round(deg)}°` : DASH
}

/** Kelvin (data unit) to Celsius for display (CONVENTIONS.md). A unit conversion, not a physical constant. */
const KELVIN_AT_0C = 273.15

export function fmtTempC(kelvin: number): string {
  if (!Number.isFinite(kelvin)) return DASH
  const c = kelvin - KELVIN_AT_0C
  return `${c < 0 ? '−' : ''}${Math.abs(c).toFixed(1)} °C`
}

/** Pascals (data unit) to millibar for display: divide by 100 (CONVENTIONS.md). */
export function fmtPressureMbar(pa: number): string {
  return Number.isFinite(pa) ? `${(pa / 100).toFixed(2)} mbar` : DASH
}

/** Dust optical depth (tau) has no unit. */
export function fmtTau(tau: number): string {
  return Number.isFinite(tau) ? tau.toFixed(2) : DASH
}

/** An assumption's value with its unit. Seconds read as hours and minutes; an empty unit says so. */
export function fmtAssumption(value: number, unit: string): string {
  if (unit === 's') return fmtDuration(value)
  return unit === '' ? `${value} (no unit)` : `${value} ${unit}`
}

/** Latitude and longitude in degrees, north and east positive (Jezero is about 18.4 N, 77.4 E). */
export function fmtLatLon(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return DASH
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`
}
