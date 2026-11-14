# Planner output and app state

This is the join between the route code (Talha) and the interface (Rafay).
The shapes below are a spec. Write the implementation to match them.

## Types

```ts
type LatLon = { lat: number; lon: number };

interface Station {
  id: string; name: string; lat: number; lon: number;
  task: string; dwellS: number; sol: number | null;
  photos: { url: string; camera: string; sol: number; credit: string }[];
}

interface PlanParams {
  slopeLimitDeg: number;   // default from assumptions: slope_limit_plan_deg
  carriedKg: number;       // equipment carried, 0 to 40
  timeLimitS: number;      // default from assumptions: eva_time_limit_s
}

type Objective = "time" | "distance";  // what each leg's route minimises: walking time (fastest) or walked distance (shortest)

interface Leg {
  fromId: string; toId: string;
  ok: boolean;             // false when no path exists under the slope limit
  distanceM: number; timeS: number; climbM: number; energyKJ: number;
  path: LatLon[];          // empty when ok is false
}

interface PlanResult {
  ok: boolean;                         // every leg ok
  status: "go" | "caution" | "nogo";
  reason: string;                      // one sentence for the status pill
  legs: Leg[];                         // base to S1, ..., last station to base
  distanceM: number;
  movingTimeS: number; stationTimeS: number; totalTimeS: number;
  spareS: number;                      // timeLimitS minus totalTimeS, may be negative
  energyKJ: number;
  doseMSv: number;
  turnBack: null | { position: LatLon; distanceAlongM: number; elapsedS: number };
}
```

## Status rules

- `nogo`: any leg has no path, or `spareS` is below zero.
- `caution`: `spareS` is below `caution_spare_s` from assumptions.
- `go`: otherwise.
- `turnBack` is the last point on the route from which elapsed time plus walk-home time plus
  `turnback_reserve_s` still fits the time limit. It is null when every point fits.

## Worker messages

To the worker:

```ts
{ type: "plan"; requestId: number; stations: Station[]; params: PlanParams; objective?: Objective }  // objective defaults to "time"
{ type: "walkHome"; requestId: number; base: LatLon; params: PlanParams }
```

From the worker:

```ts
{ type: "planResult"; requestId: number; result: PlanResult }
{ type: "walkHomeResult"; requestId: number; field: Float32Array }  // seconds to base per cell, grid layout, Infinity when unreachable
{ type: "error"; requestId: number; message: string }
```

The interface ignores any result whose `requestId` is older than its latest request.

## Helper functions the interface may call (Talha provides)

```ts
cellToLatLon(row: number, col: number): LatLon
latLonToCell(p: LatLon): { row: number; col: number } | null   // null outside the grid
sample(p: LatLon): { heightM: number; slopeDeg: number } | null
distanceM(a: LatLon, b: LatLon): number
bearingDeg(from: LatLon, to: LatLon): number
walkHomeS(p: LatLon): number                                   // Infinity when unreachable
```

## Shared state (Zustand store, one slice per row)

| Slice | Fields | Who writes | Who reads |
| --- | --- | --- | --- |
| `data` | `grid`, `manifest`, `stations`, `assumptions`, `conditions`, `loaded` | Talha (loaders) | Everyone |
| `params` | `PlanParams` | Rafay (sliders) | Talha |
| `plan` | `result: PlanResult or null`, `busy: boolean`, `compare: PlanResult or null`, `compareBusy: boolean` | Talha only | Rafay |
| `base` | `LatLon` | Rafay (move-base tool) calls `setBase`; Talha replans | Everyone |
| `position` | `estimate: LatLon`, `uncertaintyM`, `sinceFixM`, `elapsedS`, `simulated: true`, `fixes: { stationId, elapsedS }[]` | Talha only | Rafay |
| `view` | `baseView`, `reach: "off" or "distance" or "time"`, `overlay: string or null`, `overlayStrength`, `showWind`, `showLabels`, `mode: "plan" or "eva"` | Rafay only | Rafay |
| `pins` | `{ id, type: "hazard" or "sample" or "feature", lat, lon, note }[]` | Rafay only | Everyone |

Rules:

- A slice is changed only through actions defined in its own file.
- Changing `params` or `base` triggers one replan. Sliders send the new value when released, not on every pixel.
- `pins` are saved in the browser under the key `mm.pins.v1`.
- The interface never computes a route number itself. If it needs a number that `PlanResult` lacks, the spec changes first.
- `result` is always the fastest route (`objective` "time") with the current `params`.
- Comparing routes: the interface calls `requestCompare(params, objective)` and shows `compare` next to `result`.
  The two comparisons offered are the hard slope limit (`params` with `slopeLimitDeg` = `slope_limit_hard_deg`, objective "time"),
  and the shortest route (the current `params`, objective "distance"). `compare` uses its own request ids, so stale
  replies are ignored as for `result`, and it is cleared (set to null) whenever `params` or `base` change.
- Times, energy, dose and status in a "distance" result use the same speed model as a "time" result; only the path differs.
