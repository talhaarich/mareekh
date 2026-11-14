# Conventions

One answer for each question that otherwise gets guessed.

## Units inside code and data files

| Quantity | Unit | Notes |
| --- | --- | --- |
| Distance, height | metres | Shown to users in km or m. Convert only in the interface. |
| Time | seconds | Shown as hours and minutes. Sols are integers. |
| Energy | kilojoules | Shown as MJ. |
| Slope, bearing, latitude, longitude | degrees | Bearing is clockwise from north, 0 to 360. |
| Mass | kilograms | |
| Radiation dose | millisieverts | |
| Temperature | kelvin | Shown in Celsius. |
| Pressure | pascals | Shown in mbar (divide by 100). |

## Coordinates

- Latitude and longitude are planetocentric, longitude positive east, 0 to 360 not used: Jezero is about 77.45 E.
- In JSON and code, a position is an object with named keys: `{"lat": 18.4446, "lon": 77.4509}`. Never a bare pair.
- Two exceptions, both arrays because a library expects them:
  - `bounds` is `[south, west, north, east]`.
  - a layer's `coordinates` is MapLibre image-source order: four `[lon, lat]` pairs, top-left, top-right, bottom-right, bottom-left.
- Mars radius for all distance and bearing maths: 3,396,190 m.

## Grids

- Row 0 is the north edge. Column 0 is the west edge.
- Cell index is `row * width + col`.
- A cell's position is its centre.
- Binary grids are Float32, little-endian, no header. `nodata` in `grid.json` gives the missing value.
- The grid is equirectangular over `bounds`, so cell to lat/lon is linear.

## Names

- JSON files and Python: `snake_case`.
- TypeScript: `camelCase` for values, `PascalCase` for types. The loader converts JSON keys once, at the edge.
- Station ids: `B` for base, then `S1`, `S2`, ... in walking order.
- Layer ids: lowercase words, for example `satellite`, `relief`, `topo`, `elevation`, `slope`, `minerals`, `geology`.

## Git

- Branch: `name/short-task`, for example `murshad/clip-step`.
- One pull request per task. Someone else reads it before merge.
- Commit messages say what changed in plain words.
- Nothing under `data/raw/` goes into git. No single file over 20 MB.
- `main` is protected: branch, then pull request. Zero approvals are required, but read the diff before you merge.

## Paths in the app

- The live link is served from `/mareekh/`, not `/`. Build every data URL from `import.meta.env.BASE_URL`,
  for example `` `${import.meta.env.BASE_URL}data/jezero/grid.json` ``.
