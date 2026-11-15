"""The window of whole cells covering a lat/lon box, in a raster's own projected CRS.

Shared by clip and overlays so the height grid and every picture cover exactly the same cells.
A fractional window is never used: its bounds would not match the pixels actually read.
"""

from __future__ import annotations

import math

from pyproj import Transformer
from rasterio.io import DatasetReader
from rasterio.windows import Window, from_bounds

# Tolerance in pixels when rounding a window edge outwards: a box edge that falls within this of a
# cell edge snaps to it instead of adding a whole extra row or column.
EDGE_TOLERANCE_PX = 1e-6


def box_window(src: DatasetReader, bounds: tuple[float, float, float, float]) -> tuple[Window, Transformer]:
    """Whole-cell window covering (south, west, north, east) degrees, and the lon/lat -> CRS transformer.

    Args:
        src: An open raster in a projected CRS.
        bounds: (south, west, north, east) in degrees.

    Returns:
        (window, transformer). The window has integer offsets and lengths and is cropped to the file.
        The transformer converts lon/lat (always_xy) to the file's CRS; use direction INVERSE for back.

    Raises:
        ValueError: no CRS, a geographic CRS, or the box does not overlap the file.
    """
    if src.crs is None:
        raise ValueError(f"{src.name} has no CRS")
    if src.crs.is_geographic:
        raise ValueError(f"{src.name} is in a geographic CRS, not a projected one")

    south, west, north, east = bounds
    transformer = Transformer.from_crs(src.crs.geodetic_crs, src.crs, always_xy=True)
    x_west, y_south = transformer.transform(west, south)
    x_east, y_north = transformer.transform(east, north)
    w = from_bounds(
        min(x_west, x_east), min(y_south, y_north), max(x_west, x_east), max(y_south, y_north), src.transform
    )

    col0 = max(0, math.floor(w.col_off + EDGE_TOLERANCE_PX))
    row0 = max(0, math.floor(w.row_off + EDGE_TOLERANCE_PX))
    col1 = min(src.width, math.ceil(w.col_off + w.width - EDGE_TOLERANCE_PX))
    row1 = min(src.height, math.ceil(w.row_off + w.height - EDGE_TOLERANCE_PX))
    if col1 <= col0 or row1 <= row0:
        raise ValueError(f"bounds {bounds} do not overlap {src.name}")
    return Window(col0, row0, col1 - col0, row1 - row0), transformer
