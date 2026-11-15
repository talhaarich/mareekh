"""Tests for pipeline.steps.package_grids."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.steps.derive import slope_deg
from pipeline.steps.package_grids import package_grids

REPO = Path(__file__).resolve().parents[2]
TINY = REPO / "examples" / "data" / "tiny"


def _read_bin(path: Path, height: int, width: int) -> np.ndarray:
    raw = np.frombuffer(path.read_bytes(), dtype="<f4")
    assert raw.size == height * width
    return raw.reshape(height, width)


def test_round_trip(tmp_path: Path) -> None:
    rng = np.random.default_rng(0)
    dem = (rng.standard_normal((30, 40)) * 100).astype(np.float32)
    slope = slope_deg(dem, 20.0)
    meta = {"res_m": 20.0, "bounds": [18.41, 77.38, 18.512, 77.522], "nodata": -9999.0}

    package_grids(dem, slope, meta, str(tmp_path))

    dem_back = _read_bin(tmp_path / "dem.bin", 30, 40)
    slope_back = _read_bin(tmp_path / "slope.bin", 30, 40)
    assert np.array_equal(dem_back, dem)
    assert np.array_equal(slope_back, slope)


def test_north_row_first(tmp_path: Path) -> None:
    # Row 0 is the north edge: make the north row distinct and check it lands first.
    dem = np.zeros((4, 5), dtype=np.float32)
    dem[0, :] = 111.0  # north row
    dem[-1, :] = 222.0  # south row
    slope = np.zeros_like(dem)
    meta = {"res_m": 20.0, "bounds": [18.41, 77.38, 18.512, 77.522], "nodata": -9999.0}

    package_grids(dem, slope, meta, str(tmp_path))
    dem_back = _read_bin(tmp_path / "dem.bin", 4, 5)

    assert dem_back[0, 0] == 111.0
    assert dem_back[-1, 0] == 222.0


def test_nan_written_as_nodata(tmp_path: Path) -> None:
    dem = np.zeros((4, 4), dtype=np.float32)
    dem[1, 1] = np.nan
    slope = np.zeros_like(dem)
    meta = {"res_m": 20.0, "bounds": [0, 0, 1, 1], "nodata": -9999.0}

    package_grids(dem, slope, meta, str(tmp_path))
    dem_back = _read_bin(tmp_path / "dem.bin", 4, 4)
    assert dem_back[1, 1] == -9999.0


def test_default_nodata(tmp_path: Path) -> None:
    dem = np.zeros((4, 4), dtype=np.float32)
    slope = np.zeros_like(dem)
    meta = {"res_m": 20.0, "bounds": [0, 0, 1, 1]}

    package_grids(dem, slope, meta, str(tmp_path))
    grid = json.loads((tmp_path / "grid.json").read_text())
    assert grid["nodata"] == -9999.0


def test_creates_out_dir(tmp_path: Path) -> None:
    dem = np.zeros((4, 4), dtype=np.float32)
    slope = np.zeros_like(dem)
    meta = {"res_m": 20.0, "bounds": [0, 0, 1, 1]}
    out = tmp_path / "deep" / "nested"

    package_grids(dem, slope, meta, str(out))
    assert (out / "grid.json").is_file()
    assert (out / "dem.bin").is_file()
    assert (out / "slope.bin").is_file()


def test_bad_shapes_raise(tmp_path: Path) -> None:
    meta = {"res_m": 20.0, "bounds": [0, 0, 1, 1]}
    with pytest.raises(ValueError):
        package_grids(np.zeros(4, dtype=np.float32), np.zeros((4, 4), dtype=np.float32), meta, str(tmp_path))
    with pytest.raises(ValueError):
        package_grids(np.zeros((4, 4), dtype=np.float32), np.zeros((4, 5), dtype=np.float32), meta, str(tmp_path))


def test_reproduces_tiny_example(tmp_path: Path) -> None:
    """The output reproduces examples/data/tiny/dem.bin and slope.bin exactly.

    package_grids writes the arrays it is given verbatim, so passing the tiny
    grids in reproduces the tiny files byte for byte.
    """
    tiny_grid = json.loads((TINY / "grid.json").read_text())
    width, height = tiny_grid["width"], tiny_grid["height"]
    res_m = tiny_grid["res_m"]
    bounds = tiny_grid["bounds"]
    nodata = tiny_grid["nodata"]

    dem = _read_bin(TINY / "dem.bin", height, width)
    slope = _read_bin(TINY / "slope.bin", height, width)

    meta = {"res_m": res_m, "bounds": bounds, "nodata": nodata}
    package_grids(dem, slope, meta, str(tmp_path))

    assert (tmp_path / "dem.bin").read_bytes() == (TINY / "dem.bin").read_bytes()
    assert (tmp_path / "slope.bin").read_bytes() == (TINY / "slope.bin").read_bytes()

    grid = json.loads((tmp_path / "grid.json").read_text())
    assert grid["width"] == width
    assert grid["height"] == height
    assert grid["res_m"] == res_m
    assert grid["bounds"] == bounds
    assert grid["nodata"] == nodata
    assert grid["dem"] == "dem.bin"
    assert grid["slope"] == "slope.bin"