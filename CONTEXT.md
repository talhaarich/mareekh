# Martian Map: project context

Read this file first. It applies to every person and every AI assistant working in this repo.
If anything here conflicts with a brief or a chat message, this file wins until the team changes it.

## What we are building

A planning and rehearsal tool for one Mars walk (EVA) in Jezero Crater, for NASA Space Apps 2026.
A crew member opens a map, sees the stations for the walk, gets a route that avoids steep ground,
and is told whether the walk fits the time limit and where to turn back. A stripped-down EVA mode
shows only what matters outside.

The walk: two astronauts leave base, collect the sample tubes Perseverance left at its depot,
sample the delta at its base and its top, and walk home.

## Locked decisions

- Framing: planning and rehearsal in the habitat. Not mission-critical software.
- Home site: crater floor near Perseverance's landing site, about 18.4446 N, 77.4509 E (frame to be confirmed by Sadia).
- Stack: React + Vite + Tailwind + MapLibre GL JS (react-map-gl). Route finder in a Web Worker. State in Zustand.
- Pipeline: Python 3.11 with GDAL, rasterio, pyproj, numpy. One command builds every file the app loads.
- Default map view: Satellite. Other views: Relief, Topo, Elevation.
- Look: dark mission-control style, orange for base and brand, cyan for route and position.
  Red, amber and green are reserved for warning, caution and normal.
- Code starts fresh when the event opens. This kit holds documents, example data and generic repo config (gitignore, licence, deploy workflow) only.

## Who owns what

| Person | Owns | Folders |
| --- | --- | --- |
| Talha | Grid loader, route finder, budget, walk-home field, position system, local-lead contact | `web/src/lib`, `web/src/workers`, `web/src/state/plan*`, `web/src/state/position*` |
| Rafay | Repo setup and deploy workflow; everything the user sees: shell, panels, map views, labels, station cards, EVA mode, pins | `web/` scaffold and config, `.github/`, `web/src/components`, `web/src/map`, `web/src/styles`, `web/src/state/view*`, `web/src/state/pins*` |
| Sadia | Downloads, data log, stations, photos, assumptions, conditions, citations, project page | `data/`, `docs/`, `pipeline/stations.py`, `pipeline/photos.py`, `pipeline/conditions.py` |
| Murshad (remote) | Pipeline steps, manifest, built data files, smoke tests, video | `pipeline/steps`, `pipeline/make_fake.py`, `pipeline/__main__.py`, `web/public/data/jezero/` |

Ask before changing a file in someone else's folder.

## How we work this weekend

- Rafay opens the event: he creates the repo, commits this kit, scaffolds `web/` and puts up the live link
  (`docs/handoff/rafay-kickoff.md`). Everyone else clones once he posts the link.
- Murshad works remotely. Everything between him and the rest of the team goes through pull requests and the group chat.
  Nobody needs his laptop or his Python setup: he commits the built data files, and the app only reads those.
- `main` is protected. Work on a branch named `name/short-task` and open a pull request. No approval is required, but read the diff before you merge.
- Push work in progress to your branch at least every two hours, so a teammate can see it without a screen share.
- Blocked for more than 15 minutes? Post `BLOCKED: <what> <exact error or file>` in the chat.
- Calls, short, with Murshad on video: 09:00 kickoff, 11:00, 14:00, 18:00, 22:00 Saturday checkpoint,
  Sunday 10:00, 13:00 feature freeze, 18:00 video, submit by 20:00. Each person says what is merged, what is blocked, and what is next.

## The specs (read the ones your task touches)

- `docs/HOW_IT_WORKS.md`: how every part works and fits together, one level above code. Read once.
- `docs/specs/CONVENTIONS.md`: units, coordinate order, naming. Applies to all code.
- `docs/specs/CONTRACTS.md`: every data file the app loads, field by field.
- `docs/specs/PLANNER_API.md`: what the route code hands the interface, and the shared app state.
- `docs/assumptions.md`: numbers about people and conditions, with sources.
- `examples/`: sample files that match the specs. Test against these.

## Rules for AI assistants

1. Do not invent a field, unit or file name. If a spec does not cover something, stop and say so.
2. Do not change a spec file as part of a code task. Propose the change in the pull request text.
3. Never type a physical constant into code. Read it from `assumptions.json`.
4. Never compute slope from a picture layer. Only from the height grid.
5. Use the Mars radius 3,396,190 m for every distance. MapLibre's distance tools assume Earth.
6. Every number shown to a user has a unit, and either a source or the word "sample".
7. Simulated views and simulated position are labelled as simulated on screen.
8. Keep each change inside the owner's folders listed above.
   Build every data URL in the app from `import.meta.env.BASE_URL`, never a bare `/data/...` (it breaks on the live link).
9. Each pipeline function has type hints, a docstring with units, and a pytest test.
10. Out of scope, do not build: live terrain modelling, device syncing, head-tracked 3D, hologram skin.

## Scope

Must: stations and science goal, route with time/energy/turn-back, radiation and dust panel,
rover photos at stations, base point with range/bearing/fix, rocks-not-visible note, drop pins,
2D map with four views and grouped controls, labels that never overlap, EVA mode, video and project page.

Should (in order): position beacon, walk-home lines and bar, printable route card, rock-unit layer,
compare two routes, uncertainty ring, two crew markers, zoom-to-3D.
