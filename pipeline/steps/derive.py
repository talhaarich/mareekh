"""Derive slope from a height grid, in degrees, by the Horn method.

Docs: docs/specs/CONVENTIONS.md (slope in degrees, north row first, row 0 is the
north edge). Slope is computed only from the height grid, never from a picture
(CONTEXT.md rule 4).
"""

from __future__ import annotations

import numpy as np


def slope_deg(dem: np.ndarray, res_m: float) -> np.ndarray:
    """Slope in degrees, Horn method, on a height grid.

    Edge cells use the nearest row or column (the 3x3 window is padded with the
    edge value), so every cell gets a slope. A cell whose 3x3 neighbourhood
    contains a no-data cell is no-data itself, and a no-data cell is no-data
    (the Horn formula does not use the centre cell, so it is masked explicitly).
    No-data is NaN.

    Args:
        dem: Heights, metres, shape (rows, columns). Row 0 is the north edge.
        res_m: Cell size, metres.

    Returns:
        Float32 array, same shape as ``dem``, slope in degrees. NaN where the
        slope cannot be computed.

    Raises:
        ValueError: ``dem`` is not 2D, or ``res_m`` is not positive.
    """
    if dem.ndim != 2:
        raise ValueError(f"dem must be 2D, got shape {dem.shape}")
    if res_m <= 0:
        raise ValueError(f"res_m must be positive, got {res_m}")

    z = dem.astype(np.float64)
    nan = np.isnan(z)

    # Pad edges with the nearest cell (edge mode), so border cells get a slope too.
    zp = np.pad(z, 1, mode="edge")
    nanp = np.pad(nan, 1, mode="edge")

    a, b, c = zp[:-2, :-2], zp[:-2, 1:-1], zp[:-2, 2:]
    d, f = zp[1:-1, :-2], zp[1:-1, 2:]
    g, h, i = zp[2:, :-2], zp[2:, 1:-1], zp[2:, 2:]

    dz_dx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * res_m)
    dz_dy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * res_m)

    slope = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))

    # A NaN anywhere in the 3x3 neighbourhood (including the centre cell) makes
    # the result NaN. The Horn formula does not use the centre, so mask it too.
    nan_neighbour = (
        nanp[:-2, :-2] | nanp[:-2, 1:-1] | nanp[:-2, 2:]
        | nanp[1:-1, :-2] | nanp[1:-1, 2:]
        | nanp[2:, :-2] | nanp[2:, 1:-1] | nanp[2:, 2:]
    )
    slope = np.where(nan_neighbour | nan, np.nan, slope)
    return slope.astype(np.float32)