"""Tests for pipeline.steps.clip."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from rasterio.crs import CRS

from pipeline.steps.clip import clip_dem, load_dem

REPO = Path(__file__).resolve().parents[2]
ASSUMPTIONS = REPO / "web" / "public" / "data" / "jezero" / "assumptions.json"


def _radius_m() -> float:
    for item in json.loads(ASSUMPTIONS.read_text()):
        if item["key"] == "mars_radius_m":
            return float(item["value"])
    raise KeyError("mars_radius_m")


def _write_equirectangular(
    path: Path,
    dem: np.ndarray,
    res_m: float,
    centre_lon: float,
    centre_lat: float,
    radius_m: float,
    nodata: float | None = None,
) -> None:
    """Write a synthetic GeoTIFF in an equirectangular Mars CRS, centred on a point.

    The CRS is projected (metres), so the transform is built in metres: the north-west
    outer corner is converted to projected coordinates and the pixel size is res_m.
    """
    height, width = dem.shape
    lat_res = np.degrees(res_m / radius_m)
    lon_res = np.degrees(res_m / (radius_m * np.cos(np.radians(centre_lat))))
    north_edge = centre_lat + (height / 2) * lat_res  # outer edge of row 0
    west_edge = centre_lon - (width / 2) * lon_res  # outer edge of col 0
    crs = CRS.from_proj4(
        f"+proj=eqc +lat_ts={centre_lat} +lon_0={centre_lon} +x_0=0 +y_0=0 "
        f"+R={radius_m} +units=m +no_defs"
    )
    geodetic = CRS.from_proj4(
        f"+proj=longlat +R={radius_m} +units=m +no_defs"
    )
    transformer = Transformer.from_crs(geodetic, crs, always_xy=True)
    x_nw, y_nw = transformer.transform(west_edge, north_edge)
    transform = rasterio.transform.from_origin(x_nw, y_nw, res_m, res_m)
    profile = {
        "driver": "GTiff",
        "height": int(height),
        "width": int(width),
        "count": 1,
        "dtype": "float32",
        "crs": crs,
        "transform": transform,
        "nodata": nodata,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(dem.astype(np.float32), 1)


def test_pixel_size_is_exactly_20m(tmp_path: Path) -> None:
    radius = _radius_m()
    res_m = 20.0
    # Large enough grid to fully cover the clip box
    dem = np.arange(100 * 100, dtype=np.float32).reshape(100, 100)
    src = tmp_path / "src.tif"
    _write_equirectangular(src, dem, res_m, 77.455, 18.455, radius)

    meta = clip_dem(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.tif"))
    assert meta["res_m"] == pytest.approx(20.0)


def test_box_is_covered_and_values_are_original(tmp_path: Path) -> None:
    radius = _radius_m()
    res_m = 20.0
    dem = np.arange(100 * 100, dtype=np.float32).reshape(100, 100)
    src = tmp_path / "src.tif"
    _write_equirectangular(src, dem, res_m, 77.455, 18.455, radius)

    # Box fully inside the source grid
    meta = clip_dem(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.tif"))

    out = load_dem(str(tmp_path / "out.tif"))
    assert out.shape == (meta["height"], meta["width"])

    # Whole cells only: the box is covered, each edge at most one cell outside it.
    lat_cell = np.degrees(res_m / radius)
    lon_cell = np.degrees(res_m / (radius * np.cos(np.radians(18.455))))
    s, w, n, e = meta["bounds"]
    assert s <= 18.45 + 1e-9 and 18.45 - s < lat_cell
    assert n >= 18.46 - 1e-9 and n - 18.46 < lat_cell
    assert w <= 77.45 + 1e-9 and 77.45 - w < lon_cell
    assert e >= 77.46 - 1e-9 and e - 77.46 < lon_cell
    # The reported bounds are the outer edges of exactly the cells written.
    assert (n - s) / meta["height"] == pytest.approx(lat_cell, rel=1e-6)
    assert (e - w) / meta["width"] == pytest.approx(lon_cell, rel=1e-6)

    # The values are the source's own cells, unresampled: source cell (row, col) has value row * 100 + col.
    north_edge = 18.455 + 50 * lat_cell
    west_edge = 77.455 - 50 * lon_cell
    row0 = round((north_edge - n) / lat_cell)
    col0 = round((w - west_edge) / lon_cell)
    expected = dem[row0 : row0 + meta["height"], col0 : col0 + meta["width"]]
    np.testing.assert_array_equal(out, expected)


def test_nodata_becomes_nan(tmp_path: Path) -> None:
    radius = _radius_m()
    res_m = 20.0
    # Make a small grid where the box covers the whole grid
    dem = np.arange(20 * 20, dtype=np.float32).reshape(20, 20)
    # Put nodata in the centre cell (row 10, col 10)
    dem[10, 10] = -9999.0
    src = tmp_path / "src.tif"
    _write_equirectangular(src, dem, res_m, 77.455, 18.455, radius, nodata=-9999.0)

    # Box that covers the whole grid (the grid spans ~0.007°, box is 0.01°)
    meta = clip_dem(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.tif"))
    assert meta["nodata"] == -9999.0

    out = load_dem(str(tmp_path / "out.tif"))
    assert np.isnan(out[10, 10])
    # Other cells are finite
    mask = np.ones_like(out, dtype=bool)
    mask[10, 10] = False
    assert np.isfinite(out[mask]).all()


def test_box_outside_file_raises(tmp_path: Path) -> None:
    radius = _radius_m()
    res_m = 20.0
    dem = np.zeros((20, 20), dtype=np.float32)
    src = tmp_path / "src.tif"
    _write_equirectangular(src, dem, res_m, 77.455, 18.455, radius)

    with pytest.raises(ValueError):
        clip_dem(str(src), (18.55, 77.55, 18.56, 77.56), str(tmp_path / "out.tif"))


def test_geographic_crs_raises(tmp_path: Path) -> None:
    dem = np.zeros((20, 20), dtype=np.float32)
    src = tmp_path / "src.tif"
    with rasterio.open(
        src,
        "w",
        driver="GTiff",
        height=20,
        width=20,
        count=1,
        dtype="float32",
        crs=CRS.from_epsg(4326),
        transform=rasterio.transform.from_origin(77.455, 18.455, 0.001, 0.001),
    ) as dst:
        dst.write(dem, 1)

    with pytest.raises(ValueError):
        clip_dem(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.tif"))