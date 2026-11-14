import type { ImageLayer, Manifest, ManifestLayer } from './dataTypes'

/** Everything here is driven by manifest.json: a new layer in the manifest needs no code change. */

function isImageLayer(layer: ManifestLayer): layer is ImageLayer {
  return layer.type === 'image' && Array.isArray(layer.coordinates) && layer.coordinates.length === 4
}

/** Base maps, one shown at a time. `terrain` layers are skipped: they have no picture to place. */
export function viewLayers(manifest: Manifest | null): ImageLayer[] {
  return manifest ? manifest.layers.filter((l) => l.group === 'view').filter(isImageLayer) : []
}

/** Data fills, one shown at a time. */
export function overlayLayers(manifest: Manifest | null): ImageLayer[] {
  return manifest ? manifest.layers.filter((l) => l.group === 'overlay').filter(isImageLayer) : []
}

/** The view to show: the user's choice, else the manifest default, else the first view. */
export function resolveBaseView(views: ImageLayer[], chosen: string | null): ImageLayer | null {
  return (
    views.find((v) => v.id === chosen) ?? views.find((v) => v.default === true) ?? views[0] ?? null
  )
}
