# Brief for Sadia: data, science content, submission

Give this file and `CONTEXT.md` to your AI assistant at the start of every session.

You own what goes into the app and what goes onto the project page. Coding tasks are specs: write each function to match.

## Read first
`CONTEXT.md`, then `docs/specs/CONTRACTS.md` (stations, assumptions, conditions), `docs/specs/CONVENTIONS.md`, `docs/assumptions.md`.

## Your files
`data/raw/` (not in git), `docs/data-log.md`, `docs/citations.md`, `pipeline/manifests/jezero.yaml`,
`pipeline/stations.yaml`, `pipeline/stations.py`, `pipeline/photos.py`, `pipeline/conditions.py`, and a test for each.

## Tasks, in order
1. Read the 2026 submission and judging guides. Post the required fields. Start `docs/citations.md` and add to it all weekend.
2. Download the height map, photo, mineral map, geologic map, and save copies of the rover waypoint and traverse files. Log each in `docs/data-log.md`.
3. Murshad is remote, so do not send him the height file. Post its exact download link in the chat and log it first.
   He downloads it himself. Do the same for every file he needs (geologic map, mineral map, photo mosaic).
4. Walk box corners and base into `jezero.yaml`. Post the corners in the chat the moment they are set, so Murshad can re-run against them. Base and every station inside the box with 500 m to spare.
5. `stations.py`: `station_from_sol(waypoints: dict, sol: int) -> tuple[float, float]`. Writes `stations.json`.
   Test: points inside the box; unknown sol raises a clear error.
6. `photos.py`: `photos_for_sol(sol: int, max_n: int = 3) -> list[dict]`. Fills `photos`.
   Test with a saved sample response: at most `max_n` items, each with a credit.
7. `assumptions.json` from `docs/assumptions.md`, each value checked against its original source.
8. `conditions.py`: `conditions_from_meda(csv_path: str, sol: int) -> dict`. Pressure in pascals, drop 999999999,
   do not use the humidity sensor's temperature as air temperature. Raises if values are outside a sane range.
9. Project page text, complete by Sunday midday.

## Should
Geologic map clipped for an overlay. One paragraph per station on why it matters.

## Do not
Put anything from `data/raw/` in git. Leave a blank cell in the data log; write unknown.
