# Status against the briefs

Checked against the code on `main`, not against what the docs claim. Updated 2026-11-15, after the
pipeline merge (#23), slope grid and inspector (#24), 3D terrain (#25) and reach layers.
DONE = works in the app or has a passing test. PARTIAL = code exists but something is missing. MISSING = not there.

Final check on the production build (`vite build --base=/mareekh/`, the live link's path): 17 of 17 pass.
Plan is GO on real data, all views and overlays toggle, both reach modes draw, the inspector works in
2D and 3D, the route and position show in 3D, EVA opens and closes, zero failed requests, zero console errors.
Tests: web 154, Python 78 (+1 skipped).

## Must (CONTEXT.md "Scope")
| Item | Status | Evidence / gap |
| --- | --- | --- |
| Stations and science goal | DONE | `stations.json` from real rover waypoints; task text per station |
| Route with time / energy / turn-back | DONE | Real CTX terrain: GO, 3 h 13 min, 5.90 km |
| Radiation and dust panel | DONE | `SafetyPanel.tsx` (#16) |
| Rover photos at stations | DONE | Station card, live NASA photos with credits |
| Base point with range / bearing / fix | DONE | Station card, inspector, rehearsal fix log |
| Rocks-not-visible note | DONE | Honest limits panel, cell size read from `grid.json` |
| Drop pins | DONE | `FieldNotes.tsx`, saved under `mm.pins.v1` (#17) |
| 2D map, four views, grouped controls | DONE | Satellite, Relief, Topo, Elevation built by the pipeline (#23) |
| Labels that never overlap | DONE | `MapLabels.tsx` + `labelLayout.ts` with tests |
| EVA mode | DONE | `EvaScreen.tsx` (#18). Real-phone test still to do by a person |
| Video and project page | PARTIAL | `docs/project-page.md` is a draft with [BRACKETS]; video not in repo (team) |

## Should (CONTEXT.md order)
| Item | Status | Evidence / gap |
| --- | --- | --- |
| Position beacon | DONE | Beacon + edge arrow (#19) |
| Walk-home lines and bar | PARTIAL | Lines DONE (30/60/90 min contours of the walk-home field). Bar MISSING: waits on a colour rule (proposed: margin = limit − elapsed − walk home − turnback_reserve_s; red < 0, amber < caution_spare_s). About 30 min once agreed |
| Printable route card | DONE | `RouteCard.tsx` + `lib/schedule.ts` (#20) |
| Rock-unit layer | PARTIAL | Code works (#21); the geologic map is not downloaded (data-log row 12) and comes as GIS vectors, so it needs a rasterise step. About 1.5–2 h |
| Compare two routes | PARTIAL | Engine + `compareParams` done and tested; no UI calls `requestCompare`. About 45 min (preset picker, dashed route B, one tile) |
| Uncertainty ring | DONE | Map ring + `uncertaintyRing` (#18) |
| Two crew markers | MISSING | Spec gap: one estimate in the position slice (comment on #19) |
| Zoom-to-3D | DONE | Terrain-RGB tiles + MapLibre terrain, 2D/3D switch, exaggeration slider (#25) |

## Rafay (docs/briefs/rafay.md)
| # | Task | Status | Note |
| --- | --- | --- | --- |
| 0 | Repo, scaffold, live link | DONE | Deploys on every merge; link in README |
| 1 | App shell | DONE | |
| 2 | Design tokens | DONE | `tokens.css` |
| 3 | Manifest-driven views | DONE | |
| 4 | Grouped controls | DONE | Reach rings and walk-time lines now draw. Wind arrows: no wind file in the contracts, so the checkbox says so |
| 5 | Labels with leader lines | DONE | |
| 6 | Plan panel | DONE | |
| 7 | Station cards | DONE | |
| 8 | Safety and honest limits | DONE | #16 |
| 9 | Pins and notes | DONE | #17 |
| 10 | EVA mode | DONE | #18 |

## Talha (docs/briefs/talha.md)
| # | Task | Status | Note |
| --- | --- | --- | --- |
| 1 | Test PR, local-lead questions | unknown | Not checkable from code |
| 2–8 | Grid loader, Mars maths, cost, route finder, plan, walk-home, position | DONE | `lib/`, `workers/`, `state/` with tests |
| S | Uncertainty ring / compare / zoom-to-3D | DONE / PARTIAL / DONE | see Should table |

## Sadia (docs/briefs/sadia.md)
| # | Task | Status | Note |
| --- | --- | --- | --- |
| 1 | Submission guide, citations | DONE / PARTIAL | Citations lack the assumptions' original sources |
| 2 | Downloads, data log | PARTIAL | Geologic map not downloaded |
| 4 | Walk box and base | DONE | `pipeline/manifests/jezero.yaml` (kept word for word in the merge) |
| 5–6, 8 | `stations.py`, `photos.py`, `conditions.py` | DONE | tests pass |
| 7 | `assumptions.json` | PARTIAL | Present; per-value source check not recorded in citations |
| 9 | Project page | PARTIAL | Draft with open brackets (challenge name, AI use). Add the slope grid, 3D and walk-time lines now that they are live |

## Murshad (docs/briefs/murshad.md)
| # | Task | Status | Note |
| --- | --- | --- | --- |
| 1 | `make_fake.py` | DONE | |
| 2 | `environment.yml` | DONE | merged (#23) |
| 3–7 | clip, derive, package, overlays, manifest | DONE | Tested on real data and merged with six fixes (#23) |
| 8 | One-command build | DONE | `python -m pipeline build pipeline/manifests/jezero.yaml`, about 6 s |
| 9 | Live link checks | DONE (deploy) | Production build checked locally at `/mareekh/`; a check from outside still to do by a person |
| 10 | Video | unknown | Not in repo |
| S | Height tiles for 3D / hillshade and geologic overlays | DONE / DONE / PARTIAL | geology: data not downloaded |

## Left for the team (not code)
- Project page brackets and the AI-use statement; video by 19:30.
- Open the live link on a real phone (EVA mode) and from outside the team network.
- Optional, if time: compare-routes UI (about 45 min), walk-home bar once the rule is agreed (about 30 min), geologic overlay (about 1.5–2 h).
