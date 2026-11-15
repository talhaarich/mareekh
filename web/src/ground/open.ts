/**
 * Opens the 3D ground view. Kept tiny and free of three.js: the scene module is loaded with React.lazy
 * only when the view first opens, so the main bundle does not grow. The view mounts in its own React
 * root on top of the page, so the map's layout needs no change.
 */

import { createElement, lazy, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { LatLon } from '../lib/mars'

const GroundScene = lazy(() => import('./GroundScene'))

let host: HTMLDivElement | null = null
let root: Root | null = null
let opened = 0

/** Opens (or moves) the ground view to `at`; `stationId` when standing at a station, else null. */
export function openGroundScene(at: LatLon, stationId: string | null): void {
  if (!root) {
    host = document.createElement('div')
    // Inside the full-screen element if there is one, or the view would open hidden behind it.
    ;(document.fullscreenElement ?? document.body).appendChild(host)
    root = createRoot(host)
  }
  opened++
  const loading = createElement(
    'div',
    { className: 'fixed inset-0 z-[1000] flex items-center justify-center bg-bg text-sm text-fg-muted', role: 'status' },
    'Loading the ground view…',
  )
  root.render(
    createElement(
      Suspense,
      { fallback: loading },
      createElement(GroundScene, { key: opened, at: { lat: at.lat, lon: at.lon }, stationId, onClose: closeGroundScene }),
    ),
  )
}

/** Closes the ground view; unmounting it disposes the three.js scene. */
export function closeGroundScene(): void {
  root?.unmount()
  host?.remove()
  root = null
  host = null
}
