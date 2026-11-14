"""Overlay a georeferenced raster as an RGBA PNG for the map.

Docs: docs/specs/CONTRACTS.md (grid.json, layers),
docs/specs/CONVENTIONS.md (coordinates order: top-left, top-right, bottom-right,
bottom-left for PNG overlays, always in lon/lat order).
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.windows import bounds as window_bounds
from rasterio.windows import from_bounds


def export_png(
    src_path: str,
    bounds: tuple[float, float, float, float],
    out_path: str,
    max_px: int = 4096,
    nearest: bool = False,
) -> List[List[float]]:
    """Export a georeferenced raster as an RGBA PNG, with transparent empty/no-data.

    The input raster is assumed to be in a projected CRS with metric pixels, and
    the output PNG preserves the metric grid (never reprojects). Cells that are
    no-data or outside the file's data mask are transparent in the PNG.

    The box (south, west, north, east) in degrees is converted into the file's
    own projected CRS (pyproj, from ``src.crs.geodetic_crs`` to ``src.crs``,
    always_xy=True) and only the window of whole cells covering it is read, in
    the file's own pixels. The PNG is then resized so the longest side is at most
    ``max_px``: nearest-neighbour if ``nearest=True`` (for class maps), otherwise
    smooth resampling. Row 0 stays the north edge in the PNG.

    Args:
        src_path: Path to the input raster (GeoTIFF or similar).
        bounds: (south, west, north, east) in degrees.
        out_path: Where to write the PNG.
        max_px: Maximum width or height in pixels for the exported PNG. The
            longest side is scaled down if it is larger.
        nearest: If True, use nearest-neighbour resampling; otherwise smooth.

    Returns:
        Four corners as [lon, lat] pairs: top-left, top-right, bottom-right,
        bottom-left (MapLibre image-source order). The PNG has row 0 as the top
        edge, so top-left is the first corner (north-west).

    Raises:
        ValueError: the source file has no CRS, is in a geographic CRS, or the
            bounds do not overlap the file.
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

        # Output pixel size: keep the metric grid, scale the longest side to max_px.
        resampling = Resampling.nearest if nearest else Resampling.average
        out_w = int(window.width)
        out_h = int(window.height)
        scale = max(out_w, out_h) / float(max_px)
        if scale > 1.0:
            out_w = max(1, int(round(out_w / scale)))
            out_h = max(1, int(round(out_h / scale)))

        arr = src.read(
            1,
            window=window,
            out_dtype=np.float32,
            out_shape=(out_h, out_w),
            resampling=resampling,
        )
        mask = src.read_masks(1, window=window)
        if mask.shape != (out_h, out_w):
            mask_img = Image.fromarray((mask.astype(np.uint8)) * 255).resize(
                (out_w, out_h), Image.NEAREST
            )
            mask = np.asarray(mask_img) > 0
        else:
            mask = mask.astype(bool)

        # The output extent is the window's extent; out_shape preserves it.
        out_left, out_bottom, out_right, out_top = window_bounds(window, src.transform)

        nodata = src.nodatavals[0] if src.nodatavals else None
        valid = mask
        if nodata is not None:
            valid = valid & ~np.isclose(arr, float(nodata))

    # Build the RGBA PNG. Valid cells carry the value, scaled to 0-255 greyscale,
    # with alpha 255; no-data and empty cells are fully transparent.
    if np.all(~valid):
        img = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    else:
        values = arr[valid]
        vmin, vmax = float(np.min(values)), float(np.max(values))
        if vmax > vmin:
            scaled = ((arr - vmin) / (vmax - vmin) * 255.0).astype(np.uint8)
        else:
            scaled = np.full_like(arr, 128, dtype=np.uint8)
        scaled[~valid] = 0
        img = Image.fromarray(scaled, mode="L").convert("RGBA")
        alpha = (valid * 255).astype(np.uint8)
        img.putalpha(Image.fromarray(alpha, mode="L"))

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)

    lon_west, lat_south = transformer.transform(out_left, out_bottom, direction="INVERSE")
    lon_east, lat_north = transformer.transform(out_right, out_top, direction="INVERSE")

    # Corners in MapLibre image-source order: TL, TR, BR, BL.
    return [
        [lon_west, lat_north],  # TL (top-left, north-west)
        [lon_east, lat_north],  # TR (top-right, north-east)
        [lon_east, lat_south],  # BR (bottom-right, south-east)
        [lon_west, lat_south],  # BL (bottom-left, south-west)
    ]