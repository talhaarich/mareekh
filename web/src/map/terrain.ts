import { useEffect, useState } from 'react'
import { dataUrl } from '../lib/dataUrl'
import type { Manifest } from '../state/data'

/** What MapLibre needs for a raster-dem source, from the TileJSON the manifest's terrain layer points at. */
export interface TerrainSource {
  tiles: string[]
  minzoom: number
  maxzoom: number
  /** [west, south, east, north] */
  bounds: [number, number, number, number]
  encoding: 'mapbox' | 'terrarium'
  /** Lowest and highest height in the tiles, metres (pipeline-written TileJSON extra); null if absent. */
  heightRangeM: [number, number] | null
}

/**
 * Resolve a TileJSON tile template (relative to the TileJSON file) to an absolute URL, keeping the
 * {z}/{x}/{y} placeholders (URL() would percent-encode the braces).
 */
export function tileTemplate(tileJsonUrl: string, template: string, origin: string): string {
  if (/^https?:\/\//.test(template)) return template
  const dir = tileJsonUrl.slice(0, tileJsonUrl.lastIndexOf('/') + 1)
  const abs = dir.startsWith('http') ? dir : `${origin}${dir.startsWith('/') ? '' : '/'}${dir}`
  return `${abs}${template.replace(/^\.\//, '')}`
}

/** Checks a TileJSON object and turns it into a TerrainSource. Null if anything needed is missing. */
export function parseTileJson(raw: unknown, tileJsonUrl: string, origin: string): TerrainSource | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Record<string, unknown>
  const tiles = Array.isArray(t.tiles) && typeof t.tiles[0] === 'string' ? (t.tiles as string[]) : null
  const b = t.bounds
  if (!tiles || typeof t.minzoom !== 'number' || typeof t.maxzoom !== 'number') return null
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === 'number')) return null
  return {
    tiles: tiles.map((tpl) => tileTemplate(tileJsonUrl, tpl, origin)),
    minzoom: t.minzoom,
    maxzoom: t.maxzoom,
    bounds: b as [number, number, number, number],
    encoding: t.encoding === 'terrarium' ? 'terrarium' : 'mapbox', // CONTRACTS: Mapbox terrain-RGB
    heightRangeM:
      Array.isArray(t.height_range_m) && t.height_range_m.length === 2 && t.height_range_m.every((v) => typeof v === 'number')
        ? (t.height_range_m as [number, number])
        : null,
  }
}

/** The terrain source for the manifest's terrain layer, or null (no terrain layer, or its tiles are not built). */
export function useTerrainSource(manifest: Manifest | null): TerrainSource | null {
  const layer = manifest?.layers.find((l) => l.type === 'terrain') ?? null
  const url = layer ? dataUrl(layer.url) : null
  const [loaded, setLoaded] = useState<{ url: string; source: TerrainSource | null } | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .then((raw: unknown) => {
        if (!cancelled) setLoaded({ url, source: parseTileJson(raw, url, window.location.origin) })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ url, source: null })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return loaded && loaded.url === url ? loaded.source : null
}
