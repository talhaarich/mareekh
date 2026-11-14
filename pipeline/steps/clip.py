"""Clip a height file to a bounding box, keeping the file's own metric grid.

Docs: docs/specs/CONTRACTS.md (grid.json), docs/specs/CONVENTIONS.md (north row first,
row 0 is the north edge, cell size in metres). The height file is never reprojected:
the box is converted into the file's own projected CRS and only the window covering it
is read, in the file's own pixels.
"""

from __future__ import annotations

import numpy as np
import rasterio
from pyproj import Transformer
from pyproj.enums import TransformDirection
from rasterio.windows import bounds as window_bounds
from rasterio.windows import from_bounds


def load_dem(path: str) -> np.ndarray:
    """Height grid from a GeoTIFF, in metres, north row first, no-data cells as NaN.

    Args:
        path: GeoTIFF height file.

    Returns:
        Float32 array, shape (rows, columns). Row 0 is the north edge. Cells that
        match the file's nodata value are NaN.
    """
    with rasterio.open(path) as src:
        arr = src.read(1, resampling=rasterio.enums.Resampling.nearest).astype(np.float32)
        nodata = src.nodatavals[0]
    if nodata is not None:
        arr[arr == np.float32(nodata)] = np.nan
    return arr


def clip_dem(
    src_path: str,
    bounds: tuple[float, float, float, float],
    out_path: str,
) -> dict:
    """Clip a height file to a box, writing only the window's cells in the file's own pixels.

    The box (south, west, north, east) in degrees is converted into the file's own
    projected CRS (pyproj, from ``src.crs.geodetic_crs`` to ``src.crs``, always_xy=True)
    and only the window of whole cells covering it is read. The output keeps the file's
    own metric grid and pixel size: it is never reprojected.

    Args:
        src_path: Input GeoTIFF height file.
        bounds: (south, west, north, east) in degrees.
        out_path: Output GeoTIFF path.

    Returns:
        Dict with keys: ``res_m`` (cell size, metres), ``bounds`` ([south, west,
        north, east] in degrees of the cells actually written), ``nodata``, ``width``,
        ``height``.

    Raises:
        ValueError: the file is not in a projected CRS, or the box does not overlap it.
    """
    south, west, north, east = bounds

    with rasterio.open(src_path) as src:
        if src.crs is None:
            raise ValueError(f"{src_path} has no CRS")
        if src.crs.is_geographic:
            raise ValueError(f"{src_path} is in a geographic CRS, not a projected one")

        geodetic = src.crs.geodetic_crs
        transformer = Transformer.from_crs(geodetic, src.crs, always_xy=True)

        x_west, y_south = transformer.transform(west, south)
        x_east, y_north = transformer.transform(east, north)
        left, bottom = min(x_west, x_east), min(y_south, y_north)
        right, top = max(x_west, x_east), max(y_south, y_north)

        window = from_bounds(left, bottom, right, top, src.transform)
        window = window.crop(src.height, src.width)
        if window.width <= 0 or window.height <= 0:
            raise ValueError(f"bounds {bounds} do not overlap {src_path}")

        out = src.read(
            1,
            window=window,
            resampling=rasterio.enums.Resampling.nearest,
        ).astype(np.float32)
        nodata = src.nodatavals[0]
        out_left, out_bottom, out_right, out_top = window_bounds(window, src.transform)
        out_transform = rasterio.windows.transform(window, src.transform)

        lon_west, lat_south = transformer.transform(
            out_left, out_bottom, direction=TransformDirection.INVERSE
        )
        lon_east, lat_north = transformer.transform(
            out_right, out_top, direction=TransformDirection.INVERSE
        )

        profile = src.profile.copy()
        profile.update(
            {
                "height": int(window.height),
                "width": int(window.width),
                "transform": out_transform,
                "dtype": "float32",
                "nodata": nodata,
            }
        )

    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(out, 1)

    return {
        "res_m": src.res[0],
        "bounds": [lat_south, lon_west, lat_north, lon_east],
        "nodata": nodata,
        "width": int(window.width),
        "height": int(window.height),
    }