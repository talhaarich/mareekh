"""Height tiles for MapLibre's 3D terrain, from the clipped height grid.

Docs: docs/specs/CONTRACTS.md ("terrain tiles": terrain/{z}/{x}/{y}.png, Mapbox terrain-RGB),
docs/specs/CONVENTIONS.md (north row first, bounds [south, west, north, east]).

The height grid is equirectangular over its bounds (linear in lat/lon), so each tile pixel's
lat/lon maps straight to a fractional cell. Tiles use the Web Mercator XYZ scheme MapLibre asks for.
A `tiles.json` (TileJSON 3.0) beside the tiles gives the zoom range and bounds, so the app never
requests a tile that does not exist.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

TILE_PX = 256
# Mapbox terrain-RGB: height = -10000 + (R*65536 + G*256 + B) * 0.1 (a file format, not physics).
RGB_BASE_M = -10000.0
RGB_STEP_M = 0.1


def encode_terrain_rgb(height_m: np.ndarray) -> np.ndarray:
    """Heights (metres, may be negative) to Mapbox terrain-RGB, (H, W, 3) uint8. 0.1 m steps.

    Raises:
        ValueError: a height outside what the encoding can hold (-10000 m to about +1667721 m) or NaN.
    """
    if np.isnan(height_m).any():
        raise ValueError("heights contain NaN; fill no data first")
    v = np.round((height_m.astype(np.float64) - RGB_BASE_M) / RGB_STEP_M)
    if (v < 0).any() or (v > 0xFFFFFF).any():
        raise ValueError("height outside the terrain-RGB range")
    v = v.astype(np.int64)
    return np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], axis=-1).astype(np.uint8)


def decode_terrain_rgb(rgb: np.ndarray) -> np.ndarray:
    """Inverse of encode_terrain_rgb, for tests and checks. Metres."""
    r, g, b = (rgb[..., k].astype(np.float64) for k in range(3))
    return RGB_BASE_M + (r * 65536 + g * 256 + b) * RGB_STEP_M


def _tile_range(lon_w: float, lat_s: float, lon_e: float, lat_n: float, z: int) -> tuple[int, int, int, int]:
    n = 2**z

    def tx(lon: float) -> int:
        return min(n - 1, max(0, int(math.floor((lon + 180.0) / 360.0 * n))))

    def ty(lat: float) -> int:
        r = math.radians(lat)
        return min(n - 1, max(0, int(math.floor((1 - math.asinh(math.tan(r)) / math.pi) / 2 * n))))

    return tx(lon_w), ty(lat_n), tx(lon_e), ty(lat_s)


def _tile_lonlat(z: int, x: int, y: int) -> tuple[np.ndarray, np.ndarray]:
    """Longitude and latitude of each pixel centre of tile (z, x, y), each (TILE_PX, TILE_PX)."""
    n = 2**z
    i = (np.arange(TILE_PX) + 0.5) / TILE_PX
    lon = (x + i) / n * 360.0 - 180.0
    merc_y = (y + i) / n
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * merc_y))))
    return np.meshgrid(lon, lat)


def _bilinear(dem: np.ndarray, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """Sample dem at fractional cell-centre coordinates, clamped to the edge."""
    h, w = dem.shape
    r = np.clip(rows, 0, h - 1)
    c = np.clip(cols, 0, w - 1)
    r0 = np.floor(r).astype(int)
    c0 = np.floor(c).astype(int)
    r1 = np.minimum(r0 + 1, h - 1)
    c1 = np.minimum(c0 + 1, w - 1)
    fr = r - r0
    fc = c - c0
    top = dem[r0, c0] * (1 - fc) + dem[r0, c1] * fc
    bottom = dem[r1, c0] * (1 - fc) + dem[r1, c1] * fc
    return top * (1 - fr) + bottom * fr


def terrain_tiles(
    dem: np.ndarray,
    bounds: tuple[float, float, float, float],
    out_dir: str,
    minzoom: int,
    maxzoom: int,
) -> dict:
    """Write terrain-RGB tiles {z}/{x}/{y}.png covering ``bounds`` and a ``tiles.json`` beside them.

    Args:
        dem: Heights, metres, row 0 north, NaN for no data (filled with the mean, so tiles have no
            holes). Outside ``bounds`` the tiles are flat at the mean of the grid's border cells:
            stretching the edge outwards draws streaks in the hillshade.
        bounds: (south, west, north, east) in degrees: the outer edges of ``dem``.
        out_dir: Folder for the tiles, e.g. ``web/public/data/jezero/terrain``.
        minzoom: Lowest zoom written.
        maxzoom: Highest zoom written. The app over-zooms past it.

    Returns:
        The TileJSON dict written to ``tiles.json`` (tiles template relative to that file).

    Raises:
        ValueError: ``dem`` is not 2D, has no valid cell, or the zoom range is empty.
    """
    if dem.ndim != 2:
        raise ValueError(f"dem must be 2D, got shape {dem.shape}")
    if not np.isfinite(dem).any():
        raise ValueError("dem has no valid cell")
    if minzoom > maxzoom:
        raise ValueError("minzoom is above maxzoom")

    z_fill = dem.astype(np.float64)
    if np.isnan(z_fill).any():
        z_fill = np.where(np.isnan(z_fill), np.nanmean(z_fill), z_fill)

    south, west, north, east = bounds
    h, w = dem.shape
    border = np.concatenate([z_fill[0], z_fill[-1], z_fill[:, 0], z_fill[:, -1]])
    outside_m = float(border.mean())
    out = Path(out_dir)
    count = 0
    for z in range(minzoom, maxzoom + 1):
        x0, y0, x1, y1 = _tile_range(west, south, east, north, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                lon, lat = _tile_lonlat(z, x, y)
                cols = (lon - west) / (east - west) * w - 0.5
                rows = (north - lat) / (north - south) * h - 0.5
                heights = _bilinear(z_fill, rows, cols)
                beyond = (lon < west) | (lon > east) | (lat < south) | (lat > north)
                heights = np.where(beyond, outside_m, heights)
                path = out / str(z) / str(x) / f"{y}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(encode_terrain_rgb(heights), mode="RGB").save(path, optimize=True)
                count += 1

    tilejson = {
        "tilejson": "3.0.0",
        "tiles": ["{z}/{x}/{y}.png"],
        "minzoom": minzoom,
        "maxzoom": maxzoom,
        "bounds": [west, south, east, north],
        "encoding": "mapbox",
        "tile_count": count,
        # Lowest and highest height in the tiled area, metres: lets the app tint by height without guessing.
        "height_range_m": [round(float(np.nanmin(dem)), 1), round(float(np.nanmax(dem)), 1)],
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "tiles.json").write_text(json.dumps(tilejson, indent=2) + "\n", encoding="utf-8")
    return tilejson
