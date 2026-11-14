import { useEffect } from 'react'
import { useInteraction } from '../map/interaction'
import { usePosition } from '../state/position'

/**
 * Drives the simulated walk while rehearsal is playing: each animation frame moves it on by
 * real seconds × play speed. Stops by itself at the end of the walk (or if there is no walk to move along).
 * Call once in App, above both the planning screen and EVA mode, so the walk keeps moving in EVA.
 */
export function useWalkClock(): void {
  const playing = useInteraction((s) => s.playing)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dtS = (now - last) / 1000
      last = now
      const step = dtS * useInteraction.getState().playSpeed
      if (step > 0) {
        const before = usePosition.getState().elapsedS
        usePosition.getState().advance(step)
        if (usePosition.getState().elapsedS === before) {
          useInteraction.getState().setPlaying(false) // at the end, or nothing to walk along
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
