"""Tests for pipeline.steps.overlays."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.transform import from_origin

from pipeline.steps.overlays import export_png

REPO = Path(__file__).resolve().parents[2]
TINY = REPO / "examples" / "data" / "tiny"


def _write_tiny_geotiff(path: Path) -> None:
    """Write a GeoTIFF covering the clip box, in an equirectangular Mars CRS."""
    dem = np.frombuffer((TINY / "dem.bin").read_bytes(), dtype="<f4").reshape(6, 8)
    res_m = 20.0
    radius = 3396190.0
    centre_lat, centre_lon = 18.455, 77.455
    lat_res = np.degrees(res_m / radius)
    lon_res = np.degrees(res_m / (radius * np.cos(np.radians(centre_lat))))
    north_edge = centre_lat + (6 / 2) * lat_res  # outer edge of row 0
    west_edge = centre_lon - (8 / 2) * lon_res  # outer edge of col 0
    crs = CRS.from_proj4(
        f"+proj=eqc +lat_ts={centre_lat} +lon_0={centre_lon} +x_0=0 +y_0=0 "
        f"+R={radius} +units=m +no_defs"
    )
    geodetic = CRS.from_proj4(f"+proj=longlat +R={radius} +units=m +no_defs")
    transformer = Transformer.from_crs(geodetic, crs, always_xy=True)
    x_nw, y_nw = transformer.transform(west_edge, north_edge)
    transform = from_origin(x_nw, y_nw, res_m, res_m)
    profile = {
        "driver": "GTiff",
        "height": 6,
        "width": 8,
        "count": 1,
        "dtype": "float32",
        "crs": crs,
        "transform": transform,
        "nodata": -9999.0,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(dem, 1)


def test_export_png_returns_four_corners(tmp_path: Path) -> None:
    src = tmp_path / "src.tif"
    _write_tiny_geotiff(src)
    corners = export_png(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.png"))
    assert len(corners) == 4
    for pair in corners:
        assert len(pair) == 2
        assert isinstance(pair[0], float)  # lon
        assert isinstance(pair[1], float)  # lat


def test_export_png_returns_correct_corner_order(tmp_path: Path) -> None:
    src = tmp_path / "src.tif"
    _write_tiny_geotiff(src)
    corners = export_png(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.png"))
    tl, tr, br, bl = corners
    # TL should have the smallest lon and largest lat (north-west)
    assert tl[1] >= tr[1] >= br[1] >= bl[1], f"lat order: {tl[1]}, {tr[1]}, {br[1]}, {bl[1]}"
    # TL and BL share the same lon; TR and BR share the same lon
    assert tl[0] == bl[0], f"TL and BL lon should match: {tl[0]}, {bl[0]}"
    assert tr[0] == br[0], f"TR and BR lon should match: {tr[0]}, {br[0]}"
    # All lons should be roughly in the expected range
    for lon, lat in corners:
        assert 77.45 <= lon <= 77.46
        assert 18.45 <= lat <= 18.46


def test_export_png_transparent_no_data(tmp_path: Path) -> None:
    src = tmp_path / "src.tif"
    _write_tiny_geotiff(src)
    corners = export_png(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out.png"))
    assert Path(tmp_path / "out.png").is_file()
    from PIL import Image
    img = Image.open(tmp_path / "out.png")
    assert img.mode == "RGBA"


def test_export_png_nearest_resampling(tmp_path: Path) -> None:
    src = tmp_path / "src.tif"
    _write_tiny_geotiff(src)
    corners = export_png(str(src), (18.45, 77.45, 18.46, 77.46), str(tmp_path / "out_nearest.png"), nearest=True)
    assert len(corners) == 4
    assert Path(tmp_path / "out_nearest.png").is_file()