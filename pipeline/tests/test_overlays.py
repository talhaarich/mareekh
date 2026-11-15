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

# ---------- render modes ----------

from pipeline.steps.overlays import classes_present  # noqa: E402

BOX = (18.40, 77.40, 18.50, 77.50)


def _write_bands(path: Path, bands: np.ndarray, nodata: float | None = None, res_m: float = 20.0) -> None:
    """Write (count, H, W) as a GeoTIFF in an equirectangular Mars CRS centred on 18.45 N, 77.45 E."""
    count, h, w = bands.shape
    radius = 3396190.0
    crs = CRS.from_proj4(f"+proj=eqc +lat_ts=18.45 +lon_0=77.45 +x_0=0 +y_0=0 +R={radius} +units=m +no_defs")
    geodetic = CRS.from_proj4(f"+proj=longlat +R={radius} +units=m +no_defs")
    x0, y0 = Transformer.from_crs(geodetic, crs, always_xy=True).transform(77.45, 18.45)
    transform = from_origin(x0 - w / 2 * res_m, y0 + h / 2 * res_m, res_m, res_m)
    profile = {"driver": "GTiff", "height": h, "width": w, "count": count, "dtype": str(bands.dtype),
               "crs": crs, "transform": transform, "nodata": nodata}
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(bands)


def _rgba(path: Path) -> np.ndarray:
    from PIL import Image
    return np.asarray(Image.open(path).convert("RGBA"))


def test_rgb_class_map_keeps_colours_and_makes_black_transparent(tmp_path: Path) -> None:
    rgb = np.zeros((3, 4, 4), dtype=np.uint8)
    rgb[:, :2, :] = np.array([255, 0, 0], dtype=np.uint8)[:, None, None]  # top half: olivine red
    src = tmp_path / "classes.tif"
    _write_bands(src, rgb)
    export_png(str(src), BOX, str(tmp_path / "c.png"), nearest=True, render="rgb")
    img = _rgba(tmp_path / "c.png")
    assert tuple(img[0, 0]) == (255, 0, 0, 255)
    assert img[3, 3, 3] == 0  # 0,0,0 = not identified -> transparent


def test_classes_present_lists_only_classes_inside_the_box(tmp_path: Path) -> None:
    rgb = np.zeros((3, 4, 4), dtype=np.uint8)
    rgb[:, 0, 0] = [0, 153, 153]  # medium-confidence smectite counts for the smectite class
    src = tmp_path / "classes.tif"
    _write_bands(src, rgb)
    classes = [
        {"label": "Olivine", "colors": ["#ff0000", "#990000"]},
        {"label": "Fe/Mg-smectite", "colors": ["#00ffff", "#009999"]},
    ]
    assert classes_present(str(src), BOX, classes) == [{"color": "#00ffff", "label": "Fe/Mg-smectite"}]


def test_elevation_runs_low_to_high_along_the_ramp(tmp_path: Path) -> None:
    dem = np.tile(np.linspace(-2600, -2400, 8, dtype=np.float32), (8, 1))[None]  # rises to the east
    src = tmp_path / "dem.tif"
    _write_bands(src, dem, nodata=-9999.0)
    export_png(str(src), BOX, str(tmp_path / "e.png"), render="elevation", options={"ramp": ["#0000ff", "#ff0000"]})
    img = _rgba(tmp_path / "e.png").astype(int)
    west, east = img[4, 0], img[4, -1]
    assert west[2] > west[0] and east[0] > east[2]  # blue at the low end, red at the high end
    assert (img[..., 3] == 255).all()


def test_topo_draws_contour_lines(tmp_path: Path) -> None:
    dem = np.tile(np.linspace(0, 70, 8, dtype=np.float32), (8, 1))[None]  # crosses 10 m levels
    src = tmp_path / "dem.tif"
    _write_bands(src, dem, nodata=-9999.0)
    export_png(str(src), BOX, str(tmp_path / "t.png"), render="topo", options={"interval_m": 10})
    grey = _rgba(tmp_path / "t.png")[4, :, 0].astype(int)
    assert grey.min() <= 95 < grey.max()  # some line pixels, some shaded ground


def test_hillshade_lights_north_west_facing_slopes(tmp_path: Path) -> None:
    rows = np.arange(8, dtype=np.float32)[:, None] * np.ones((1, 8), dtype=np.float32)
    faces_north = (-rows * 5)[None]   # higher to the north -> slope faces south (dark)
    faces_south = (rows * 5)[None]    # higher to the south -> slope faces north (lit)
    for name, dem in (("n", faces_north), ("s", faces_south)):
        _write_bands(tmp_path / f"{name}.tif", dem, nodata=-9999.0)
        export_png(str(tmp_path / f"{name}.tif"), BOX, str(tmp_path / f"{name}.png"), render="hillshade")
    assert _rgba(tmp_path / "s.png")[4, 4, 0] > _rgba(tmp_path / "n.png")[4, 4, 0]


def test_unknown_render_raises(tmp_path: Path) -> None:
    src = tmp_path / "src.tif"
    _write_tiny_geotiff(src)
    with pytest.raises(ValueError, match="unknown render"):
        export_png(str(src), BOX, str(tmp_path / "x.png"), render="sparkles")
