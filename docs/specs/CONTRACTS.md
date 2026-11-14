# Data contracts

Every file the app loads lives in `web/public/data/jezero/` and is written by the pipeline.
Matching examples are in `examples/data/jezero/`. A tiny test grid is in `examples/data/tiny/`.

## grid.json

| Field | Type | Meaning |
| --- | --- | --- |
| `width` | int | Columns |
| `height` | int | Rows |
| `res_m` | number | Cell size in metres |
| `bounds` | [south, west, north, east] | Degrees, outer edges of the grid |
| `nodata` | number | Value meaning no data in the binary grids |
| `dem` | string | File name of the height grid |
| `slope` | string | File name of the slope grid |

## dem.bin and slope.bin

Float32, little-endian, `width * height` values, north row first. Height in metres, slope in degrees.
Slope uses the Horn method on the height grid. Slope is never computed in the browser from pictures.

## manifest.json

```
{
  "region": { "name": string, "bounds": [s, w, n, e], "base": { "lat": number, "lon": number } },
  "layers": [ Layer, ... ]
}
```

Layer fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | See layer ids in CONVENTIONS |
| `name` | string | Label shown in the interface |
| `group` | "view" or "overlay" | A view is a base map (one at a time). An overlay is a data fill (one at a time). |
| `type` | "image" or "terrain" | `image` is one PNG. `terrain` is height tiles. |
| `url` | string | Path relative to the data folder |
| `coordinates` | four [lon, lat] pairs | Image corners: TL, TR, BR, BL. Omit for `terrain`. |
| `default` | bool, optional | True on the one view shown at start |
| `legend` | list of `{ "color": string, "label": string }` | May be empty |
| `credit` | string | Who made the data. Required. |
| `caveat` | string | What the layer cannot tell you. Required, may be empty. |

## stations.json

A list in walking order. The first item is base.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `B`, `S1`, ... |
| `name` | string | Short name |
| `lat`, `lon` | number | Position |
| `task` | string | One or two sentences: what the crew does here |
| `dwell_s` | int | Time spent at the station, seconds. 0 for base. |
| `sol` | int or null | Rover sol the position came from |
| `photos` | list | Each: `url`, `camera`, `sol`, `credit` |

## assumptions.json

A list. The app looks values up by `key`.

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | string | Fixed keys are listed in `docs/assumptions.md` |
| `value` | number | In the units of CONVENTIONS |
| `unit` | string | For display |
| `source` | string | Plain-words source |
| `url` | string | Link, may be empty |
| `kind` | "published" or "team" | Team means our own assumption |

## conditions.json

```
{ "sol": int, "tau": number, "air_temp_k": number, "pressure_pa": number, "source": string, "caveat": string }
```

## terrain tiles (Should)

`terrain/{z}/{x}/{y}.png`, Mapbox terrain-RGB encoding, listed in the manifest as a `terrain` layer.

## What is not a file

The cost grid. The app builds it from `slope.bin`, the slope limit and the speed model, so sliders work without the pipeline.
