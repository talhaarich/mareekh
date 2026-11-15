/**
 * Two flags the ground view shares with the map, outside React state because they are read in event handlers
 * and effects at the moment something happens, not rendered.
 */

/** A map click that skipped the ground-view flight must not also open the point card. */
let swallow = false

/** The ground view calls this when a press on the map skipped its flight. */
export function swallowNextMapClick(): void {
  swallow = true
}

/** The map's click handler calls this first: true (once) if the click belongs to the ground view. */
export function groundSwallowsClick(): boolean {
  const s = swallow
  swallow = false
  return s
}

/**
 * True from leaving the ground view until the camera is back where it was. While true, the map must not run its
 * own 2D/3D camera moves for the 2D/3D setting being put back.
 */
let restoring = false

export function setGroundRestoring(on: boolean): void {
  restoring = on
}

export function isGroundRestoring(): boolean {
  return restoring
}
