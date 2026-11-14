/**
 * Shapes of the files the map reads, exactly as in docs/specs/CONTRACTS.md and PLANNER_API.md.
 * TEMPORARY HOME: when Talha's loader lands, import his types and delete this file.
 */
export type LatLon = { lat: number; lon: number }

/** [lon, lat] */
export type Corner = [number, number]
/** TL, TR, BR, BL (MapLibre image-source order) */
export type Corners = [Corner, Corner, Corner, Corner]

export interface LegendEntry {
  color: string
  label: string
}

export interface ManifestLayer {
  id: string
  name: string
  group: 'view' | 'overlay'
  type: 'image' | 'terrain'
  /** Path relative to the data folder */
  url: string
  coordinates?: Corners
  default?: boolean
  legend: LegendEntry[]
  credit: string
  caveat: string
}

export interface Manifest {
  region: {
    name: string
    /** [south, west, north, east] */
    bounds: [number, number, number, number]
    base: LatLon
  }
  layers: ManifestLayer[]
}

/** A manifest layer the map can draw as one picture. */
export type ImageLayer = ManifestLayer & { type: 'image'; coordinates: Corners }

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  task: string
  dwellS: number
  sol: number | null
  photos: { url: string; camera: string; sol: number; credit: string }[]
}
