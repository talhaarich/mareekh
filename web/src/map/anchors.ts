/**
 * Hidden style layers that fix the drawing order, whatever order layers mount in.
 * A layer added with `beforeId` set to one of these draws just below it:
 * crater relief shading < ANCHOR_BACKDROP < views < ANCHOR_OVERLAYS < overlays (pictures, slope grid)
 * < ANCHOR_DATA < route, ring, everything else.
 */
export const ANCHOR_BACKDROP = 'mm-anchor-backdrop'
export const ANCHOR_OVERLAYS = 'mm-anchor-overlays'
export const ANCHOR_DATA = 'mm-anchor-data'
