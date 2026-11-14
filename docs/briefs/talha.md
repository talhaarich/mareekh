# Brief for Talha: engine, route planner, position

Give this file and `CONTEXT.md` to your AI assistant at the start of every session.

You own everything that computes. The interface never calculates a route number; it shows what you hand it.

## Read first
`CONTEXT.md`, then `docs/specs/CONVENTIONS.md`, `docs/specs/PLANNER_API.md`, `docs/specs/CONTRACTS.md`.

## Your files
`web/src/lib/grid.ts`, `web/src/lib/mars.ts`, `web/src/lib/cost.ts`, `web/src/workers/router.worker.ts`,
`web/src/state/data.ts`, `web/src/state/plan.ts`, `web/src/state/position.ts`, and tests beside each.

## Tasks, in order
1. Rafay creates the repo and scaffold at 09:00. Clone it, push a branch, and open a test pull request.
   Ask the local lead two things in writing: that prototypes seen before the event are disclosed and the code is fresh,
   and that Murshad taking part remotely is fine under your local event.
2. Grid loader. Fetch files with `import.meta.env.BASE_URL` (see CONVENTIONS). Done when `examples/data/tiny` loads and corner cells convert to lat/lon and back.
3. Mars distance and bearing. Done when 18.0 N to 19.0 N on one longitude is about 59.3 km.
4. Cost from slope and limit, and the speed model, reading constants from `assumptions.json`.
5. Route finder in the worker, by walking time, eight neighbours, blocked above the limit.
   Done when three tiny grids pass (open, wall with a gap, walled in) and the map pans during a search.
   Keep search distances in 64-bit numbers.
6. Full walk through all stations returning a `PlanResult` exactly as specified.
7. Walk-home field and `turnBack`.
8. Position: base as origin, simulated walk, fix at a landmark, fixes logged.

## Should
Uncertainty ring and fix prompt. Compare two routes. Zoom-to-3D with Rafay.

## Do not
Change anything under `web/src/components`. Add a field to `PlanResult` without updating the spec first.
