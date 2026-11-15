"""Tests for pipeline.steps.terrain_tiles."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline.steps.terrain_tiles import decode_terrain_rgb, encode_terrain_rgb, terrain_tiles

BOUNDS = (18.41, 77.38, 18.512, 77.522)


def test_encoding_round_trips_negative_mars_heights() -> None:
    h = np.array([[-2650.0, -2410.3, 0.0, -9999.9]])
    np.testing.assert_allclose(decode_terrain_rgb(encode_terrain_rgb(h)), h, atol=0.05)


def test_encoding_rejects_nan_and_out_of_range() -> None:
    with pytest.raises(ValueError, match="NaN"):
        encode_terrain_rgb(np.array([[np.nan]]))
    with pytest.raises(ValueError, match="range"):
        encode_terrain_rgb(np.array([[-10001.0]]))


def test_tiles_cover_the_box_and_tilejson_describes_them(tmp_path: Path) -> None:
    dem = np.full((30, 40), -2500.0, dtype=np.float32)
    tj = terrain_tiles(dem, BOUNDS, str(tmp_path), 10, 12)
    assert json.loads((tmp_path / "tiles.json").read_text()) == tj
    assert tj["minzoom"] == 10 and tj["maxzoom"] == 12 and tj["encoding"] == "mapbox"
    assert tj["bounds"] == [77.38, 18.41, 77.522, 18.512]  # TileJSON order: west, south, east, north
    files = sorted(tmp_path.glob("*/*/*.png"))
    assert len(files) == tj["tile_count"] > 0
    assert {p.parts[-3] for p in files} == {"10", "11", "12"}
    rgb = np.asarray(Image.open(files[0]))
    assert rgb.shape == (256, 256, 3)
    np.testing.assert_allclose(decode_terrain_rgb(rgb), -2500.0, atol=0.05)


def test_heights_land_in_the_right_place(tmp_path: Path) -> None:
    # West half low, east half high: a tile pixel west of the box centre must read low.
    dem = np.full((30, 40), -2600.0, dtype=np.float32)
    dem[:, 20:] = -2400.0
    terrain_tiles(dem, BOUNDS, str(tmp_path), 14, 14)
    from pipeline.steps.terrain_tiles import _tile_lonlat

    lows = highs = 0
    for p in tmp_path.glob("14/*/*.png"):
        x, y = int(p.parts[-2]), int(p.stem)
        lon, lat = _tile_lonlat(14, x, y)
        h = decode_terrain_rgb(np.asarray(Image.open(p)))
        inside = (lat > 18.42) & (lat < 18.50)
        west = inside & (lon > BOUNDS[1]) & (lon < 77.44)
        east = inside & (lon > 77.46) & (lon < BOUNDS[3])
        lows += int((np.abs(h[west] + 2600) < 1).sum())
        highs += int((np.abs(h[east] + 2400) < 1).sum())
        assert (np.abs(h[west] + 2600) < 1).all() and (np.abs(h[east] + 2400) < 1).all()
    assert lows > 0 and highs > 0


def test_no_data_is_filled_so_tiles_have_no_holes(tmp_path: Path) -> None:
    dem = np.full((10, 10), -2500.0, dtype=np.float32)
    dem[5, 5] = np.nan
    terrain_tiles(dem, BOUNDS, str(tmp_path), 10, 10)
    for p in tmp_path.glob("10/*/*.png"):
        assert np.isfinite(decode_terrain_rgb(np.asarray(Image.open(p)))).all()


def test_outside_the_box_is_flat_at_the_border_mean(tmp_path: Path) -> None:
    dem = np.full((10, 10), -2500.0, dtype=np.float32)
    dem[0, :] = -2400.0  # north border higher
    terrain_tiles(dem, BOUNDS, str(tmp_path), 9, 9)
    from pipeline.steps.terrain_tiles import _tile_lonlat

    border_mean = float(np.concatenate([dem[0], dem[-1], dem[:, 0], dem[:, -1]]).mean())
    seen = 0
    for p in tmp_path.glob("9/*/*.png"):
        lon, lat = _tile_lonlat(9, int(p.parts[-2]), int(p.stem))
        h = decode_terrain_rgb(np.asarray(Image.open(p)))
        far = (lon < BOUNDS[1] - 0.05) | (lat > BOUNDS[2] + 0.05)
        seen += int(far.sum())
        np.testing.assert_allclose(h[far], border_mean, atol=0.05)
    assert seen > 0
