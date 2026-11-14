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
