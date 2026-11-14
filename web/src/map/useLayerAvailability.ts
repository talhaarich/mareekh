import { create } from 'zustand'
import { dataUrl } from '../lib/dataUrl'
import type { Manifest } from '../state/data'

/**
 * layer id -> true if its picture file exists. A missing key means not checked yet.
 * The pipeline builds the pictures, so on a fresh checkout some can be absent; the map skips those.
 */
interface AvailabilityState {
  available: Record<string, boolean>
  check: (manifest: Manifest) => Promise<void>
}

/** A dev server answers a missing file with index.html, so check the type too. */
async function imageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  }
}

export const useLayerAvailability = create<AvailabilityState>()((set) => ({
  available: {},
  check: async (manifest) => {
    const pictures = manifest.layers.filter((l) => l.type === 'image')
    const found = await Promise.all(pictures.map((l) => imageExists(dataUrl(l.url))))
    const available: Record<string, boolean> = {}
    pictures.forEach((l, i) => {
      available[l.id] = found[i]
    })
    set({ available })
  },
}))
