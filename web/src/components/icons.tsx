/** Small line icons for the panel rails and toolbar. Decorative: every button carries its own label. */
const PATHS = {
  /** Stacked layers */
  view: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
    </>
  ),
  /** Rings around a point */
  reach: (
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  /** Half-filled square */
  overlay: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 15h18M3 9h18M9 3v18" />
    </>
  ),
  /** Map pin */
  notes: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  /** Clipboard */
  plan: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  /** Path between two points */
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
    </>
  ),
  /** Flag */
  stops: (
    <>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </>
  ),
  /** Play */
  rehearse: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4V8Z" />
    </>
  ),
  /** Shield */
  safety: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    </>
  ),
  /** Gauge */
  limits: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m12 18 4-6" />
    </>
  ),
  /** Eye with a slash (hide) */
  hide: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" />
    </>
  ),
  /** Eye (show) */
  show: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  /** Corners out */
  fullscreen: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </>
  ),
  /** Question mark in a circle */
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2" />
      <path d="M12 17.6v.4" />
    </>
  ),
  /** Cube: 3D */
  cube: (
    <>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  minus: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  /** Compass needle: north */
  north: (
    <>
      <path d="M12 3 8 13h8L12 3Z" />
      <path d="M8 13l4 8 4-8" />
    </>
  ),
  turnLeft: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  turnRight: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </>
  ),
  /** Tilt toward the horizon */
  tiltUp: (
    <>
      <path d="M3 19h18" />
      <path d="M5 19 17 7" />
      <path d="M11 7h6v6" />
    </>
  ),
  /** Tilt back toward straight down */
  tiltDown: (
    <>
      <path d="M3 19h18" />
      <path d="M12 4v11" />
      <path d="M8 11l4 4 4-4" />
    </>
  ),
  /** Corners in */
  exitFullscreen: (
    <>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export default function UiIcon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
