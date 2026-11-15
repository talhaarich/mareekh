"""Rasterise a vector map of units (e.g. the USGS SIM 3464 geologic map) onto the height grid as a PNG.

Docs: docs/specs/CONTRACTS.md (manifest layers: coordinates TL, TR, BR, BL as [lon, lat]),
docs/specs/CONVENTIONS.md (bounds, north row first).

The polygons are reprojected from their own CRS into the clipped height file's CRS and burned onto
that file's grid (optionally finer), so the picture lines up cell for cell with grid.json.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pyogrio
import rasterio
import shapely
from affine import Affine
from PIL import Image
from pyproj import CRS, Transformer
from rasterio.features import rasterize

# A unit is listed in the legend only above this share of the mapped pixels (a display choice).
LEGEND_MIN_SHARE = 0.005
# Unit contacts are drawn darker, like the printed map's lines (a display choice).
CONTACT_SHADE = 0.55


def _hex_rgb(colour: str) -> tuple[int, int, int]:
    c = colour.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def rasterize_units(
    src_path: str,
    layer: str,
    field: str,
    grid_tif: str,
    out_path: str,
    classes: list[dict[str, Any]],
    scale: int = 4,
) -> dict[str, Any]:
    """Burn unit polygons onto the grid of ``grid_tif`` and write an RGBA PNG.

    Args:
        src_path: Vector source (e.g. a .gdb folder) readable by GDAL.
        layer: Layer name in it (e.g. ``GeoUnits_v1``).
        field: Attribute holding the unit code.
        grid_tif: The clipped height file; its CRS, extent and cell size define the picture.
        out_path: PNG to write.
        classes: ``{"value": code, "label": str, "color": "#rrggbb"}``. Units not listed stay transparent.
        scale: Picture pixels per grid cell along each side.

    Returns:
        ``{"coordinates": [TL, TR, BR, BL] as [lon, lat], "legend": [{"color", "label"}]}``; the legend
        lists units covering at least ``LEGEND_MIN_SHARE`` of the mapped pixels, in ``classes`` order.

    Raises:
        ValueError: no polygon overlaps the grid, or ``scale`` is not positive.
    """
    if scale < 1:
        raise ValueError("scale must be at least 1")
    info = pyogrio.read_info(src_path, layer=layer)
    src_crs = CRS.from_user_input(info["crs"])
    meta, _, wkb, fields = pyogrio.raw.read(src_path, layer=layer, columns=[field])
    values = fields[0]
    geoms = shapely.from_wkb(wkb)

    with rasterio.open(grid_tif) as grid:
        dst_crs = CRS.from_user_input(grid.crs.to_wkt())
        width, height = grid.width * scale, grid.height * scale
        transform = grid.transform * Affine.scale(1 / scale)
        left, bottom, right, top = grid.bounds
        to_lonlat = Transformer.from_crs(dst_crs, dst_crs.geodetic_crs, always_xy=True)

    to_grid = Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    geoms = shapely.transform(geoms, lambda xy: np.column_stack(to_grid.transform(xy[:, 0], xy[:, 1])))
    box = shapely.box(left, bottom, right, top)

    index = {str(c["value"]): i + 1 for i, c in enumerate(classes)}  # 0 = no unit
    shapes = [
        (g, index[str(v)])
        for g, v in zip(geoms, values)
        if g is not None and str(v) in index and shapely.intersects(g, box)
    ]
    if not shapes:
        raise ValueError(f"no {layer} polygon overlaps {grid_tif}")
    cls = rasterize(shapes, out_shape=(height, width), transform=transform, fill=0, dtype="uint16")

    palette = np.zeros((len(classes) + 1, 3), dtype=np.float64)
    for i, c in enumerate(classes):
        palette[i + 1] = _hex_rgb(c["color"])
    rgb = palette[cls]
    contact = np.zeros(cls.shape, dtype=bool)
    contact[:, 1:] |= cls[:, 1:] != cls[:, :-1]
    contact[1:, :] |= cls[1:, :] != cls[:-1, :]
    rgb[contact] *= CONTACT_SHADE
    rgba = np.dstack([rgb, np.where(cls > 0, 255, 0)]).astype(np.uint8)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)

    mapped = int((cls > 0).sum())
    legend = [
        {"color": c["color"], "label": c["label"]}
        for i, c in enumerate(classes)
        if mapped and (cls == i + 1).sum() / mapped >= LEGEND_MIN_SHARE
    ]
    lon_w, lat_s = to_lonlat.transform(left, bottom)
    lon_e, lat_n = to_lonlat.transform(right, top)
    return {
        "coordinates": [[lon_w, lat_n], [lon_e, lat_n], [lon_e, lat_s], [lon_w, lat_s]],
        "legend": legend,
    }
