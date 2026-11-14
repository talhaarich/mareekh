# How it works

What each part takes in, what it does, what it hands on, and where it can go wrong. This is design, not code.
Field names, units and file layouts are fixed in `docs/specs/`. If this file and a spec disagree, the spec wins.

## 1. The NASA data

Sadia downloads it. Murshad processes it.

| Dataset | What it is | Gives us | Watch out for |
|---|---|---|---|
| CTX height map (DEM), 20 m | Elevation of Jezero from orbit, one value per 20 m cell | Slope, route cost, Relief/Topo/Elevation views, walk-home field | Already a metric grid in metres, so never reproject it. It has "no data" holes. |
| CTX photo mosaic, 5 m | Greyscale orbital photo, aligned to the DEM | Satellite view (default) | Big file. Clip it to the walk box and cap it at 4096 px. |
| CRISM mineral map | Mineral classes from orbital spectra | Mineral overlay: clays and carbonates, which explain why the delta matters | It's a class map, so resample with nearest-neighbour or the colours turn into fake classes |
| USGS geologic map (SIM 3464) | Mapped rock units of Jezero | Rock-unit overlay (Should) | Comes as GIS vectors. Rasterise it to the box. |
| Perseverance waypoints and traverse | Rover position for every sol, and its driven path | Real station positions, rover-path overlay | The server blocks direct browser loading (no CORS), so the pipeline saves a copy |
| Raw images feed | Every rover photo, by sol and camera | 1–3 real photos per station card | Credit every image (NASA/JPL-Caltech, plus ASU for Mastcam-Z) |
| MEDA weather data | Perseverance's weather station | Dust opacity, air temperature, pressure for the conditions panel | Pressure is in Pa. 999999999 means missing. The humidity sensor's temperature is not air temperature. |
| Published numbers (no download) | Apollo walk speeds, work rates, Curiosity's radiation dose | `assumptions.json`: every physical constant the app uses | Each needs a citation. The radiation number was measured in Gale crater, so say so on screen. |

## 2. Pipeline (Murshad, remote)

**Input:** `pipeline/manifests/jezero.yaml`. It holds the walk box corners, the base point, the raw file paths and the list of layers.
**Output:** everything in `web/public/data/jezero/`.

1. **`make_fake`** (hour 1, numpy only). Builds a made-up crater: a bowl and a ridge on a 400×300 grid at 20 m, with slope computed from it, written in the exact real format. It exists so the app side never waits.
2. **`clip_dem`**. Converts the box from lat/lon into the DEM's own coordinate system with pyproj, then reads only that window with rasterio. The output keeps exactly 20 m pixels. An 8×6 km box gives about 400×300 cells, roughly 0.5 MB per file, small enough to commit.
3. **`slope_deg`**. Horn's method: for each cell, a 3×3 neighbourhood gives the east–west and north–south height change, and slope = atan(√(dx² + dy²)) in degrees. Edge cells copy their neighbour. A "no data" cell makes its neighbours "no data" too. Test it against `gdaldem slope`.
4. **`package_grids`**. Writes `dem.bin` and `slope.bin` as raw Float32 little-endian, north row first, plus `grid.json`.
   The DEM is equirectangular, which is linear in latitude and longitude. That's why the app can convert between cell and lat/lon with a straight line, with no projection library in the browser.
5. **`export_png`**, run once per layer:
   - **Satellite:** CTX photo, clipped and downsampled.
   - **Relief:** hillshade made from the DEM (sun from the north-west).
   - **Elevation:** DEM on a colour ramp.
   - **Topo:** contours over a light hillshade.
   - **Minerals:** CRISM class map, nearest-neighbour.

   Each is warped onto the DEM's grid so they line up, with transparent pixels outside the data, and returns its four corner coordinates.
6. **`write_manifest`**. Collects every layer into `manifest.json`: id, name, group, url, corners, legend, credit and caveat. The interface builds its view buttons from this file, so a new layer needs no new code.
7. **One command** runs steps 2–6. Deleting the output folder and running it once must rebuild everything.
8. **Should: terrain tiles.** The DEM encoded into RGB tiles at `terrain/{z}/{x}/{y}.png`, for MapLibre's 3D tilt.

## 3. Science data (Sadia)

- **`stations.yaml`** is written by hand. For each station: id (B, S1–S4), name, the sol Perseverance was there, the task, and `dwell_s`.
- **`station_from_sol`** looks up the rover waypoint for that sol and returns lat/lon. If one sol has several entries, it takes the last. An unknown sol raises an error. Output: `stations.json`.
  Base is not a rover stop. Its position is set by hand near the landing site.
- **`photos_for_sol`** queries the raw images feed for that sol, prefers navigation and Mastcam-Z cameras, skips thumbnails, keeps at most 3 and attaches a credit to each.
- **`conditions_from_meda`** filters MEDA to one sol, drops missing values, and takes the median of air temperature, pressure and dust opacity. It raises an error outside 150–300 K or at 1,500 Pa and above. Output: `conditions.json`, with source and caveat.
- **`assumptions.json`** has 20 entries: key, value, unit, source, url, and kind (published or team). These are the only numbers the engine may use.
- **Submission:** data log, citations, AI-use statement, project page, video script.

## 4. Engine (Talha)

**Input:** the grid files, `stations.json`, `assumptions.json`, and `PlanParams` from the sliders (slope limit, carried mass, time limit).
**Output:** `PlanResult`, the walk-home field, and position state.

**Cost of one step.** Each cell connects to its 8 neighbours.
- **Flat distance:** 20 m to a side neighbour, 28.3 m to a diagonal one.
- **Grade:** height change ÷ flat distance. Up and down differ, so A→B costs something different from B→A.
- **Blocked** if the target cell's slope (from `slope.bin`) is over the limit.
- **Speed:** a hiking curve, fastest on a slight downhill and dropping fast on steep grades: `v = vmax · e^(−3.5·(|grade + 0.05| − 0.05))`, so flat ground is exactly vmax. (The prototype used `v = vmax · e^(−3.5·|grade + 0.05|)`, which made flat ground 0.84·vmax.) vmax is `walk_speed_long_ms`, 0.75 m/s, because the walk is several hours; the shape numbers are `speed_decay_per_grade` and `speed_optimum_grade`. All three come from `assumptions.json`.
- **Time:** 3D step length ÷ speed.

**Route finder.** Dijkstra on time, with a binary heap, in a Web Worker. Distances are stored as 64-bit floats. At about 120k cells, a search takes milliseconds. It returns the path as lat/lon points.

**Plan.** One search per leg: B→S1→S2→S3→S4→B. For each leg it sums distance, time, climb and energy.
- **Energy:** walking time × `work_rate_walk_kj_h`, plus station time × `work_rate_station_kj_h`, plus climb work: (`suited_mass_kg` + carried mass) × `mars_gravity_ms2` × metres climbed.
- **Dose:** total time × `dose_rate_msv_h`.
- **Totals:** moving time + station time = total time. Spare = limit − total.
- **Status:** NO-GO if any leg has no path or spare is below zero. CAUTION if spare is under `caution_spare_s`. GO otherwise. Each status has a one-sentence reason.

**Walk-home field.** One Dijkstra outward from base on reversed edges, because what matters is the cost of walking toward base. The result is the seconds to base from every cell.
- The 30/60/90-minute lines are contours of this field.
- **Turn-back:** walk along the planned route adding up elapsed time. The turn-back point is the last point where elapsed time + time home + `turnback_reserve_s` still fits the limit.

**Position.**
- Base is the origin. Range and bearing to base use `mars_radius_m`, never MapLibre's Earth maths.
- The simulated walk moves the marker along the route at modelled speed.
- **Uncertainty:** `drift_fraction` × distance walked since the last fix.
- **Fix at a landmark:** snaps the marker to the landmark, resets the uncertainty and logs it.

**Messages.** The interface sends a plan request with a `requestId`. The worker replies with the result. Replies older than the latest request are ignored, so fast slider drags never show stale results.

## 5. Interface (Rafay)

**State (Zustand).** The interface writes `params`, `view` and `pins`. It only reads `plan`, `position` and `data`, so it can never calculate a route number itself.

**Map.**
- MapLibre with a blank dark style. Each manifest layer is an image source placed by its four corners.
- Only one view is on at a time. One data overlay can sit on top, with a strength slider.
- The route is a GeoJSON line, with a turn-back marker. Stations and base are point layers.
- **Labels:** MapLibre's built-in labels can't draw leader lines. So after each pan or zoom, a small screen-space placer moves labels out of each other's way and draws a thin line back to each marker.

**Panels.**
- **Plan panel:** status pill with its reason, tiles (time, spare, distance, energy, dose), and the leg table. Hovering a row highlights that leg. Sliders update `params` when released, not while dragging.
- **Station card:** task, range and bearing, walk-home time, photos with credits.
- **Safety panel:** dose and dust, each with its source.
- **Honest limits:** for example, that rocks are not visible at this resolution and slope stands in for them.
- **Pins:** saved in localStorage under `mm.pins.v1`.
- **EVA mode:** one large-type screen with two buttons.

**Rule:** every number on screen has a unit and a source, or the word "sample".

## 6. How it runs together

**One click on "Plan walk":**
1. The panel puts the slider values into `params`.
2. The store sends the worker a request, using the grid, stations and assumptions already loaded.
3. The worker runs the leg searches and the walk-home search, then returns a `PlanResult`.
4. The store saves it. The map redraws the route and turn-back marker, and the panel fills in status, numbers and legs.
5. Changing the slope limit repeats steps 1–4. Blocked cells change, so the route bends and the status can flip.

**Over the weekend, fake data is swapped for real without code changes:**
- **Hour 1:** fake grids and example JSON, so all the code runs on stand-ins.
- **Saturday afternoon:** real grids, then real stations and assumptions.
- **Saturday evening:** the real manifest with real map images.

Each swap is a pull request that replaces files in `web/public/data/jezero/`. If a swap breaks the app, the file doesn't match its spec, and the fix goes in the pipeline, not the app.

**Shipping.** Every merge to `main` redeploys the live link. Murshad checks it from outside before each call, then records the video against it on Sunday at 18:00. Sadia's project page explains it, with citations.
