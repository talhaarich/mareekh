/**
 * Where to fit extra stops into a walk (cheapest insertion). The walk is a loop: base, the stops in
 * order, back to base. Each extra goes in the gap where it adds the least distance (`dist`, e.g.
 * straight-line Mars distance); the stops already in the walk keep their order. The planner then
 * computes the real walking times for the result.
 */
export function insertStops<T>(walk: T[], extras: T[], dist: (a: T, b: T) => number): T[] {
  if (walk.length === 0) return []
  const route = [...walk]
  const base = walk[0]
  for (const x of extras) {
    let bestAt = route.length
    let bestCost = Infinity
    for (let i = 1; i <= route.length; i++) {
      const prev = route[i - 1]
      const next = i < route.length ? route[i] : base // the last gap is the walk home
      const cost = dist(prev, x) + dist(x, next) - dist(prev, next)
      if (cost < bestCost) {
        bestCost = cost
        bestAt = i
      }
    }
    route.splice(bestAt, 0, x)
  }
  return route
}
