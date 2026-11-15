"""Tests for pipeline.steps.derive."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from pipeline.steps.derive import slope_deg

REPO = Path(__file__).resolve().parents[2]
TINY = REPO / "examples" / "data" / "tiny"


def _has_gdaldem() -> bool:
    return shutil.which("gdaldem") is not None


def test_flat_gives_zero() -> None:
    dem = np.full((10, 10), 123.0, dtype=np.float32)
    slope = slope_deg(dem, 20.0)
    assert slope.shape == dem.shape
    assert np.allclose(slope, 0.0)


def test_tiny_grid_matches_example() -> None:
    dem = np.frombuffer((TINY / "dem.bin").read_bytes(), dtype="<f4").reshape(6, 8)
    slope = slope_deg(dem, 20.0)
    # Away from the edges the slope is the 2 m rise over 20 m cell
    assert slope[1:-1, 1:-1] == pytest.approx(5.7106, abs=1e-3)


def test_nodata_spreads_to_neighbours_only() -> None:
    dem = np.full((15, 15), 0.0, dtype=np.float32)
    # A single no-data cell in the middle
    dem[7, 7] = np.nan

    slope = slope_deg(dem, 20.0)

    # The no-data cell itself is NaN
    assert np.isnan(slope[7, 7])
    # Its 8 neighbours are NaN
    for r in (6, 7, 8):
        for c in (6, 7, 8):
            assert np.isnan(slope[r, c]), f"cell ({r}, {c}) should be NaN"
    # Cells two away are not NaN
    assert np.isfinite(slope[5, 7])
    assert np.isfinite(slope[7, 5])
    assert np.isfinite(slope[9, 7])
    assert np.isfinite(slope[7, 9])
    assert np.isfinite(slope[5, 5])


def test_nodata_on_edge_spreads() -> None:
    dem = np.full((10, 10), 0.0, dtype=np.float32)
    dem[0, 0] = np.nan  # corner cell

    slope = slope_deg(dem, 20.0)
    assert np.isnan(slope[0, 0])
    # The three neighbours of the corner are NaN
    for r, c in ((0, 1), (1, 0), (1, 1)):
        assert np.isnan(slope[r, c])
    assert np.isfinite(slope[2, 0])
    assert np.isfinite(slope[0, 2])


def test_not_2d_raises() -> None:
    with pytest.raises(ValueError):
        slope_deg(np.zeros(4, dtype=np.float32), 20.0)
    with pytest.raises(ValueError):
        slope_deg(np.zeros((4, 4, 4), dtype=np.float32), 20.0)


def test_bad_res_raises() -> None:
    with pytest.raises(ValueError):
        slope_deg(np.zeros((4, 4), dtype=np.float32), 0.0)
    with pytest.raises(ValueError):
        slope_deg(np.zeros((4, 4), dtype=np.float32), -1.0)


def test_dtype_and_shape() -> None:
    dem = np.zeros((5, 5), dtype=np.float64)
    slope = slope_deg(dem, 20.0)
    assert slope.dtype == np.float32
    assert slope.shape == dem.shape


@pytest.mark.skipif(not _has_gdaldem(), reason="gdaldem is not installed")
def test_matches_gdaldem(tmp_path: Path) -> None:
    """Real points on a synthetic grid match gdaldem slope within 0.5 degrees."""
    import rasterio
    from rasterio.crs import CRS

    rng = np.random.default_rng(1)
    dem = (rng.standard_normal((40, 40)) * 50).astype(np.float32)
    res_m = 20.0
    crs = CRS.from_proj4(
        f"+proj=eqc +lat_ts=18.45 +lon_0=77.45 +x_0=0 +y_0=0 "
        f"+R=3396190 +units=m +no_defs"
    )
    transform = rasterio.transform.from_origin(77.44, 18.46, res_m, res_m)
    tif = tmp_path / "dem.tif"
    with rasterio.open(
        tif, "w", driver="GTiff", height=40, width=40, count=1,
        dtype="float32", crs=crs, transform=transform, nodata=-9999.0,
    ) as dst:
        dst.write(dem, 1)

    out = tmp_path / "slope.tif"
    subprocess.run(
        ["gdaldem", "slope", str(tif), "-of", "GTiff", str(out), "-co", "COMPRESS=NONE"],
        check=True,
        capture_output=True,
    )
    with rasterio.open(out) as src:
        gdal_slope = src.read(1).astype(np.float32)

    ours = slope_deg(dem, res_m)
    # Compare interior cells only: gdaldem handles edges differently
    assert np.allclose(ours[1:-1, 1:-1], gdal_slope[1:-1, 1:-1], atol=0.5, equal_nan=True)