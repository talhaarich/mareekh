"""Write the binary height and slope grids plus grid.json for the app to load.

Docs: docs/specs/CONTRACTS.md (grid.json, dem.bin, slope.bin),
docs/specs/CONVENTIONS.md (Float32 little-endian, north row first, row 0 is the
north edge, index = row * width + col).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

DEFAULT_NODATA = -9999.0


def package_grids(
    dem: np.ndarray,
    slope: np.ndarray,
    meta: dict,
    out_dir: str,
) -> None:
    """Write ``dem.bin``, ``slope.bin`` and ``grid.json`` into ``out_dir``.

    The binary grids are raw Float32, little-endian, ``width * height`` values,
    north row first. NaN is written as the nodata value. ``out_dir`` is created
    if it does not exist.

    Args:
        dem: Heights, metres, shape (rows, columns). Row 0 is the north edge.
        slope: Slopes, degrees, same shape as ``dem``.
        meta: Grid metadata. Needs ``res_m`` and ``bounds`` ([south, west,
            north, east] in degrees). Optional ``nodata`` (default -9999.0).
            The dict returned by ``clip_dem`` works here.
        out_dir: Folder to write into.

    Raises:
        ValueError: ``dem`` and ``slope`` are not both 2D, or they differ in shape.
    """
    if dem.ndim != 2 or slope.ndim != 2:
        raise ValueError(f"dem and slope must be 2D, got shapes {dem.shape} and {slope.shape}")
    if dem.shape != slope.shape:
        raise ValueError(f"dem and slope must have the same shape, got {dem.shape} and {slope.shape}")

    height, width = dem.shape
    nodata = float(meta.get("nodata", DEFAULT_NODATA))

    dem_arr = np.asarray(dem, dtype=np.float32)
    slope_arr = np.asarray(slope, dtype=np.float32)
    dem_arr = np.where(np.isnan(dem_arr), np.float32(nodata), dem_arr)
    slope_arr = np.where(np.isnan(slope_arr), np.float32(nodata), slope_arr)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    (out / "dem.bin").write_bytes(dem_arr.astype("<f4").tobytes())
    (out / "slope.bin").write_bytes(slope_arr.astype("<f4").tobytes())

    grid = {
        "width": int(width),
        "height": int(height),
        "res_m": float(meta["res_m"]),
        "bounds": [float(v) for v in meta["bounds"]],
        "nodata": nodata,
        "dem": "dem.bin",
        "slope": "slope.bin",
    }
    (out / "grid.json").write_text(json.dumps(grid, indent=2) + "\n")