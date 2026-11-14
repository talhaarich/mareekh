"""Make a made-up crater so the app is never blocked on real data.

Writes ``grid.json``, ``dem.bin`` and ``slope.bin`` in the formats of
docs/specs/CONTRACTS.md. Numpy only: no GDAL, so anyone can re-run it.
The terrain is invented. It is not Jezero.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

# Locked home site, CONTEXT.md. The fake grid is centred here.
HOME_LAT = 18.4446
HOME_LON = 77.4509

NODATA = -9999.0
ASSUMPTIONS_FILE = "assumptions.json"
RADIUS_KEY = "mars_radius_m"


def _read_radius_m(out_dir: Path) -> float:
    """Return the Mars radius in metres, read from ``assumptions.json`` in ``out_dir``.

    Rule 3 of CONTEXT.md: a physical constant is read from the assumptions file, never typed.
    """
    path = out_dir / ASSUMPTIONS_FILE
    if not path.is_file():
        raise FileNotFoundError(f"{path} is needed for the Mars radius; copy it into the output folder first")
    for item in json.loads(path.read_text()):
        if item["key"] == RADIUS_KEY:
            return float(item["value"])
    raise KeyError(f"{RADIUS_KEY} not found in {path}")


def _bounds(width: int, height: int, res_m: float, radius_m: float) -> list[float]:
    """Grid outer edges ``[south, west, north, east]`` in degrees, centred on the home site.

    Args:
        width: Columns.
        height: Rows.
        res_m: Cell size, metres.
        radius_m: Mars radius, metres.
    """
    half_lat = math.degrees((height * res_m / 2) / radius_m)
    half_lon = math.degrees((width * res_m / 2) / (radius_m * math.cos(math.radians(HOME_LAT))))
    return [
        round(HOME_LAT - half_lat, 6),
        round(HOME_LON - half_lon, 6),
        round(HOME_LAT + half_lat, 6),
        round(HOME_LON + half_lon, 6),
    ]


def _smooth_noise(rng: np.random.Generator, height: int, width: int, corr_cells: float) -> np.ndarray:
    """Smooth random field with zero mean and unit spread (unitless).

    Args:
        rng: Random source.
        height: Rows.
        width: Columns.
        corr_cells: Feature size in cells.
    """
    white = rng.standard_normal((height, width))
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.fftfreq(width)[None, :]
    filt = np.exp(-((fx**2 + fy**2) * (2 * math.pi * corr_cells) ** 2) / 2)
    field = np.fft.ifft2(np.fft.fft2(white) * filt).real
    return (field - field.mean()) / field.std()


def _fake_dem(width: int, height: int, res_m: float, seed: int) -> np.ndarray:
    """Made-up heights, metres, north row first: flat floor, a rim to the north, a delta fan with a steep edge.

    Args:
        width: Columns.
        height: Rows.
        res_m: Cell size, metres.
        seed: Random seed, so the same inputs give the same file.
    """
    rng = np.random.default_rng(seed)
    y = (np.arange(height)[:, None] + 0.5) / height  # 0 north .. 1 south
    x = (np.arange(width)[None, :] + 0.5) / width  # 0 west .. 1 east

    dem = np.zeros((height, width))
    dem += 60.0 * np.clip((0.22 - y) / 0.22, 0, 1) ** 2  # rim, north edge
    dem += 25.0 * np.clip((x - 0.85) / 0.15, 0, 1) ** 2  # rise on the east edge

    # Delta: a raised fan to the north-west with a steep front.
    dist = np.hypot((x - 0.28) * width, (y - 0.38) * height * 1.2)
    radius_cells = 0.2 * width
    fan = 1.0 / (1.0 + np.exp((dist - radius_cells) / (0.01 * width)))
    dem += 150.0 * fan

    dem += 3.0 * _smooth_noise(rng, height, width, corr_cells=0.04 * width)  # gentle hills
    dem += 0.15 * _smooth_noise(rng, height, width, corr_cells=3.0)  # surface roughness
    dem -= 2600.0  # sits well below the datum
    return dem.astype(np.float32)


def _horn_slope_deg(dem: np.ndarray, res_m: float) -> np.ndarray:
    """Horn-method slope, degrees, north row first. Edge cells use the nearest row or column.

    Args:
        dem: Heights, metres, shape (rows, columns).
        res_m: Cell size, metres.
    """
    z = np.pad(dem.astype(np.float64), 1, mode="edge")
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dz_dx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * res_m)
    dz_dy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * res_m)
    return np.degrees(np.arctan(np.hypot(dz_dx, dz_dy))).astype(np.float32)


def make_fake(out_dir: str, width: int = 400, height: int = 300, res_m: float = 20.0) -> None:
    """Write ``grid.json``, ``dem.bin`` and ``slope.bin`` for a made-up crater into ``out_dir``.

    ``out_dir`` must already hold ``assumptions.json`` (the Mars radius is read from it).

    Args:
        out_dir: Folder to write into, normally ``web/public/data/jezero``.
        width: Columns.
        height: Rows.
        res_m: Cell size, metres.

    Raises:
        FileNotFoundError: ``assumptions.json`` is not in ``out_dir``.
    """
    out = Path(out_dir)
    radius_m = _read_radius_m(out)

    dem = _fake_dem(width, height, res_m, seed=0)
    slope = _horn_slope_deg(dem, res_m)

    out.joinpath("dem.bin").write_bytes(dem.astype("<f4").tobytes())
    out.joinpath("slope.bin").write_bytes(slope.astype("<f4").tobytes())
    grid = {
        "width": width,
        "height": height,
        "res_m": res_m,
        "bounds": _bounds(width, height, res_m, radius_m),
        "nodata": NODATA,
        "dem": "dem.bin",
        "slope": "slope.bin",
    }
    out.joinpath("grid.json").write_text(json.dumps(grid, indent=2) + "\n")