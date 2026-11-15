"""Tests for pipeline.steps.units."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pyogrio
import pytest
import rasterio
import shapely
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin

from pipeline.steps.units import rasterize_units

R = 3396190.0
EQC = f"+proj=eqc +lat_ts=18.45 +lon_0=0 +x_0=0 +y_0=0 +R={R} +units=m +no_defs"
TMERC = f"+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs"


def _grid(path: Path) -> rasterio.Affine:
    """A 20 x 10 cell, 20 m grid in an equirectangular CRS, west edge at x0."""
    x0, y0 = 4_340_000.0, 1_094_000.0
    t = from_origin(x0, y0, 20.0, 20.0)
    with rasterio.open(path, "w", driver="GTiff", width=20, height=10, count=1, dtype="float32", crs=CRS.from_proj4(EQC), transform=t) as d:
        d.write(np.zeros((1, 10, 20), dtype=np.float32))
    return t


def _units(path: Path, grid_tif: Path) -> None:
    """Two units in a different CRS (transverse Mercator): west half 'a', east half 'b'."""
    from pyproj import Transformer

    with rasterio.open(grid_tif) as g:
        l, b, r, t = g.bounds
    to_tm = Transformer.from_crs(CRS.from_proj4(EQC), CRS.from_proj4(TMERC), always_xy=True)
    mid = (l + r) / 2

    def poly(x0: float, x1: float) -> shapely.Polygon:
        xs, ys = to_tm.transform([x0, x1, x1, x0], [b - 50, b - 50, t + 50, t + 50])
        return shapely.Polygon(list(zip(xs, ys)))

    geoms = [poly(l - 50, mid), poly(mid, r + 50)]
    pyogrio.raw.write(
        str(path),
        geometry=np.array(shapely.to_wkb(geoms), dtype=object),
        field_data=[np.array(["a", "b"], dtype=object)],
        fields=["unit"],
        geometry_type="Polygon",
        crs=TMERC,
        driver="GPKG",
        layer="units",
    )


def test_units_burn_onto_the_grid_with_their_colours_and_legend(tmp_path: Path) -> None:
    grid = tmp_path / "grid.tif"
    _grid(grid)
    gpkg = tmp_path / "units.gpkg"
    _units(gpkg, grid)
    classes = [
        {"value": "a", "label": "Unit A", "color": "#ff0000"},
        {"value": "b", "label": "Unit B", "color": "#0000ff"},
        {"value": "c", "label": "Unit C (absent)", "color": "#00ff00"},
    ]
    out = rasterize_units(str(gpkg), "units", "unit", str(grid), str(tmp_path / "u.png"), classes, scale=2)

    img = np.asarray(Image.open(tmp_path / "u.png"))
    assert img.shape == (20, 40, 4)  # scale 2 on a 20 x 10 grid
    assert tuple(img[10, 5]) == (255, 0, 0, 255)   # west: unit a
    assert tuple(img[10, 34]) == (0, 0, 255, 255)  # east: unit b
    assert out["legend"] == [{"color": "#ff0000", "label": "Unit A"}, {"color": "#0000ff", "label": "Unit B"}]
    # the contact between them is drawn darker
    assert img[10, 19:21, 0].min() < 255 or img[10, 19:21, 2].min() < 255

    tl, tr, br, bl = out["coordinates"]
    assert tl[1] == tr[1] and bl[1] == br[1] and tl[0] == bl[0] and tr[0] == br[0]
    assert tl[1] > bl[1] and tr[0] > tl[0]


def test_no_overlap_raises(tmp_path: Path) -> None:
    grid = tmp_path / "grid.tif"
    _grid(grid)
    gpkg = tmp_path / "units.gpkg"
    _units(gpkg, grid)
    with pytest.raises(ValueError, match="no units polygon"):
        rasterize_units(str(gpkg), "units", "unit", str(grid), str(tmp_path / "u.png"), [{"value": "zzz", "label": "Z", "color": "#000000"}])
