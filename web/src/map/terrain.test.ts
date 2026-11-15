import { describe, expect, it } from 'vitest'
import { parseTileJson, tileTemplate } from './terrain'

describe('terrain source', () => {
  it('resolves the tile template next to the TileJSON, keeping the placeholders', () => {
    expect(tileTemplate('/mareekh/data/jezero/terrain/tiles.json', '{z}/{x}/{y}.png', 'https://x.io')).toBe(
      'https://x.io/mareekh/data/jezero/terrain/{z}/{x}/{y}.png',
    )
    expect(tileTemplate('/data/t/tiles.json', './{z}/{x}/{y}.png', 'http://localhost:5199')).toBe(
      'http://localhost:5199/data/t/{z}/{x}/{y}.png',
    )
    expect(tileTemplate('/a/tiles.json', 'https://cdn/{z}/{x}/{y}.png', 'http://o')).toBe('https://cdn/{z}/{x}/{y}.png')
  })

  it('reads zoom range, bounds and encoding from the TileJSON', () => {
    const tj = { tilejson: '3.0.0', tiles: ['{z}/{x}/{y}.png'], minzoom: 8, maxzoom: 13, bounds: [77.38, 18.41, 77.52, 18.51], encoding: 'mapbox' }
    expect(parseTileJson(tj, '/d/terrain/tiles.json', 'http://o')).toEqual({
      tiles: ['http://o/d/terrain/{z}/{x}/{y}.png'],
      minzoom: 8,
      maxzoom: 13,
      bounds: [77.38, 18.41, 77.52, 18.51],
      encoding: 'mapbox',
    })
  })

  it('is null for a broken or missing TileJSON (e.g. a dev server answering with index.html)', () => {
    expect(parseTileJson(null, '/t.json', 'http://o')).toBeNull()
    expect(parseTileJson({ tiles: ['{z}/{x}/{y}.png'], minzoom: 8 }, '/t.json', 'http://o')).toBeNull()
  })
})
