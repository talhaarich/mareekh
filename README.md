# Martian Map

A planning and rehearsal tool for one Mars walk (EVA) in Jezero Crater.
NASA Space Apps Challenge 2026, "Martian Map" challenge.

**Live link:** https://talhaarich.github.io/mareekh/

## What it does (for the judges)

Two astronauts leave base, collect the sample tubes Perseverance left at the Three Forks depot,
sample the delta at its base and its top, and walk home. Martian Map plans that walk on real terrain.

- **Real Jezero terrain.** NASA MRO CTX height map (20 m) and photo mosaic (5 m), processed by our own
  Python pipeline. Four map views (Satellite, Relief, Topo, Elevation), a CRISM mineral overlay with
  its real colour key, and the USGS geologic map (rock units) of Jezero.
- **Route planner.** Finds the fastest walk through the stations around ground steeper than a slope
  limit you set, in a Web Worker. Reports time, spare time, distance, energy and radiation dose, a
  GO / CAUTION / NO-GO status with its reason, and where to turn back.
- **Slope grid.** The exact 20 m grid the planner routes on, coloured walkable / over the plan limit /
  over the hard limit. It follows the slope slider live.
- **3D terrain of the whole crater.** One click flies into 3D along the delta front; "Whole crater" shows
  the rim 1.5 km above the floor. Vertical exaggeration 1–10×. The route, slope grid and walk-time lines
  drape over the terrain.
- **Reach from base.** Distance rings (including NASA's 10 km walk-back limit) or walk-time lines: how
  long the walk home takes from anywhere, at 30, 60 and 90 minutes.
- **Click inspector.** Click anywhere for height, slope, whether you may walk there, and the time home.
- **Five stations from where Perseverance actually stood**: the Three Forks sample depot, the delta's
  base and top, Rochette (its first rock cores) and Roubion (its first coring attempt), with the rover's
  own photos and credits.
- **Safety and honest limits.** Radiation (Curiosity's Gale crater measurement, said so on screen),
  dust, temperature and pressure from Perseverance's MEDA, and a list of what the tool cannot know.
  Every number on screen has a unit and a source.
- **Walk rehearsal and EVA mode.** Play the walk with a simulated position and uncertainty ring,
  confirm position fixes at landmarks, and switch to a large-type EVA screen for outside.
- **Field notes and a printable route card.** Drop hazard / sample / feature pins with notes (saved in
  the browser) and print a one-page card with arrival times at each stop.

Planning and rehearsal only. Not mission-critical software.

## Run the app

```bash
cd web
npm install
npm run dev        # http://localhost:5173/
npm test           # unit tests (vitest)
npm run build      # production build into web/dist
```

The app reads only the files in `web/public/data/jezero/`, which are committed, so you do not need the
pipeline to run it.

## Rebuild the data (pipeline)

Python 3.11+ with rasterio, pyproj, numpy, Pillow and PyYAML (`environment.yml` for conda, or
`pip install rasterio pyproj numpy pillow pyyaml pytest`).

1. Put the raw files in `data/raw/` (not in git). Names and download links: `docs/data-log.md`.
   You need at least `M20_JezeroCrater_CTXDEM_20m.tif`; the photo and mineral map are optional
   (a missing source skips its layer with a warning).
2. From the repo root:

   ```bash
   python -m pipeline build pipeline/manifests/jezero.yaml
   python -m pytest pipeline/tests tests/pipeline
   ```

One command clips the height map to the walk box (never reprojected), derives slope (Horn method),
writes `grid.json` + `dem.bin` + `slope.bin`, the overlay pictures, 3D height tiles (`terrain/`) and
`manifest.json`. Stations, photos and conditions come from `pipeline/stations.py`, `photos.py` and
`conditions.py`.

## Start here (team)

1. Read `CONTEXT.md`.
2. Read `docs/HOW_IT_WORKS.md`, then your own brief in `docs/briefs/`.
3. Give `CONTEXT.md` and your brief to your AI assistant at the start of every session.
4. Specs in `docs/specs/` change only by a pull request that edits the spec and tells the team.

Progress against the briefs: `STATUS.md`.

## Layout

| Folder | Holds |
| --- | --- |
| `web/` | The app (React, Vite, Tailwind, MapLibre GL JS, Zustand) |
| `web/public/data/jezero/` | Every file the app loads. Written by the pipeline. |
| `pipeline/` | Python steps that build those files |
| `docs/` | Specs, briefs, assumptions, data log, citations |
| `examples/` | Sample files that match the specs |

## Team

Talha (engine, route planner) · Rafay (interface) · Sadia (data, science, submission) · Murshad (pipeline, deploy, video)

Data credits and sources: `docs/citations.md`.
