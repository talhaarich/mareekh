"""Tests for pipeline.make_fake."""

import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from pipeline.make_fake import _horn_slope_deg, make_fake

REPO = Path(__file__).resolve().parents[2]
ASSUMPTIONS = REPO / "web" / "public" / "data" / "jezero" / "assumptions.json"


@pytest.fixture()
def out_dir(tmp_path: Path) -> Path:
    shutil.copy(ASSUMPTIONS, tmp_path / "assumptions.json")
    return tmp_path


def _read(out: Path, name: str, w: int, h: int) -> np.ndarray:
    raw = np.frombuffer((out / name).read_bytes(), dtype="<f4")
    assert raw.size == w * h
    return raw.reshape(h, w)


def test_files_match_contract(out_dir: Path) -> None:
    make_fake(str(out_dir), width=60, height=40, res_m=20.0)
    grid = json.loads((out_dir / "grid.json").read_text())
    assert set(grid) == {"width", "height", "res_m", "bounds", "nodata", "dem", "slope"}
    assert (grid["width"], grid["height"], grid["res_m"]) == (60, 40, 20.0)
    south, west, north, east = grid["bounds"]
    assert south < north and west < east
    assert (out_dir / "dem.bin").stat().st_size == 60 * 40 * 4
    assert (out_dir / "slope.bin").stat().st_size == 60 * 40 * 4


def test_bounds_span_matches_cell_size(out_dir: Path) -> None:
    make_fake(str(out_dir), width=400, height=300, res_m=20.0)
    south, west, north, east = json.loads((out_dir / "grid.json").read_text())["bounds"]
    radius = next(a["value"] for a in json.loads(ASSUMPTIONS.read_text()) if a["key"] == "mars_radius_m")
    north_south_m = np.radians(north - south) * radius
    assert north_south_m == pytest.approx(300 * 20.0, rel=1e-3)
    assert (west + east) / 2 == pytest.approx(77.4509, abs=1e-5)


def test_values_are_finite_and_slope_in_range(out_dir: Path) -> None:
    make_fake(str(out_dir), width=200, height=150)
    dem = _read(out_dir, "dem.bin", 200, 150)
    slope = _read(out_dir, "slope.bin", 200, 150)
    assert np.isfinite(dem).all() and np.isfinite(slope).all()
    assert slope.min() >= 0 and slope.max() < 90
    assert slope.max() > 20  # steeper than slope_limit_hard_deg (20), so the router has something to avoid
    assert np.median(slope) < 10  # most of it is walkable


def test_same_inputs_same_bytes(out_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> None:
    other = tmp_path_factory.mktemp("again")
    shutil.copy(ASSUMPTIONS, other / "assumptions.json")
    make_fake(str(out_dir), width=50, height=50)
    make_fake(str(other), width=50, height=50)
    assert (out_dir / "dem.bin").read_bytes() == (other / "dem.bin").read_bytes()


def test_horn_matches_tiny_example() -> None:
    tiny = REPO / "examples" / "data" / "tiny"
    dem = np.frombuffer((tiny / "dem.bin").read_bytes(), dtype="<f4").reshape(6, 8)
    slope = _horn_slope_deg(dem, 20.0)
    assert slope[1:-1, 1:-1] == pytest.approx(5.7106, abs=1e-3)


def test_needs_assumptions_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        make_fake(str(tmp_path))