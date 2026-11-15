"""Overlay a georeferenced raster as an RGBA PNG for the map.

Docs: docs/specs/CONTRACTS.md (grid.json, layers),
docs/specs/CONVENTIONS.md (coordinates order: top-left, top-right, bottom-right,
bottom-left for PNG overlays, always in lon/lat order).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, List

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import bounds as window_bounds

from pipeline.steps.window import box_window

RENDERS = ("grey", "rgb", "hillshade", "elevation", "topo")

# Picture-making choices (not physical constants): light from the north-west, 45 degrees up,
# the usual cartographic convention, and the stretch percentiles for photos.
SUN_AZIMUTH_DEG = 315.0
SUN_ALTITUDE_DEG = 45.0
PHOTO_STRETCH_PCT = (0.5, 99.5)
# A class-map pixel within this RGB distance of a key colour is that class. Class maps saved with
# lossy compression carry near-miss colours (152,76,0 for 153,77,0); anything further is not a class.
# Kept well under half the closest gap between two classes' colours (about 25), so classes never swap.
# A class is listed in the legend only above this share of the identified pixels in the box, so a
# few stray pixels do not add a legend line (a display choice).
LEGEND_MIN_SHARE = 0.005
CLASS_COLOUR_TOLERANCE = 12.0


def _hex_rgb(colour: str) -> tuple[int, int, int]:
    c = colour.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def hillshade(dem: np.ndarray, cell_m: tuple[float, float]) -> np.ndarray:
    """Hillshade 0..1 from heights (metres) with cell size (x, y) in metres. NaN stays NaN.

    Args:
        dem: Heights, metres, row 0 north.
        cell_m: Cell width and height on the ground, metres.

    Returns:
        Float array 0..1 (1 = facing the light), same shape.
    """
    z = np.where(np.isnan(dem), np.nanmean(dem), dem).astype(np.float64)
    dz_dy, dz_dx = np.gradient(z, cell_m[1], cell_m[0])
    dz_dy = -dz_dy  # rows run north to south; flip so +y is north
    slope = np.arctan(np.hypot(dz_dx, dz_dy))
    aspect = np.arctan2(-dz_dx, -dz_dy)  # direction the slope faces, clockwise from north
    az = np.radians(SUN_AZIMUTH_DEG)
    alt = np.radians(SUN_ALTITUDE_DEG)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0, 1)
    return np.where(np.isnan(dem), np.nan, shade)


def snap_classes(rgb: np.ndarray, classes: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    """Snap each pixel of an (H, W, 3) class map to the nearest key colour.

    Args:
        rgb: Colours, 0..255.
        classes: ``{"label", "colors": ["#rrggbb", ...]}``; each colour is a valid shade of that class.

    Returns:
        (snapped colours (H, W, 3) uint8, class index (H, W) int, -1 where no class is within
        ``CLASS_COLOUR_TOLERANCE``: not identified, outside the scene, or noise).
    """
    keys, owner = [], []
    for i, c in enumerate(classes):
        for col in c["colors"]:
            keys.append(_hex_rgb(col))
            owner.append(i)
    key = np.array(keys, dtype=np.float64)
    flat = rgb.reshape(-1, 3).astype(np.float64)
    dist = np.linalg.norm(flat[:, None, :] - key[None, :, :], axis=-1)
    nearest = dist.argmin(axis=1)
    ok = dist[np.arange(len(flat)), nearest] <= CLASS_COLOUR_TOLERANCE
    snapped = np.where(ok[:, None], key[nearest], 0).astype(np.uint8).reshape(rgb.shape)
    cls = np.where(ok, np.array(owner)[nearest], -1).reshape(rgb.shape[:2])
    return snapped, cls


def _ramp(t: np.ndarray, stops: list[str]) -> np.ndarray:
    """Colour 0..255 (H, W, 3) for t in 0..1 along evenly spaced hex colour stops."""
    cols = np.array([_hex_rgb(s) for s in stops], dtype=np.float64)
    pos = np.linspace(0, 1, len(stops))
    t = np.clip(np.nan_to_num(t), 0, 1)
    return np.stack([np.interp(t, pos, cols[:, k]) for k in range(3)], axis=-1)


def _render(
    arr: np.ndarray, valid: np.ndarray, render: str, cell_m: tuple[float, float], options: dict[str, Any]
) -> np.ndarray:
    """RGBA uint8 image (H, W, 4) for one render mode. ``arr`` is (bands, H, W)."""
    h, w = arr.shape[1:]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    if render == "rgb":
        colours = np.clip(arr[:3].transpose(1, 2, 0), 0, 255).astype(np.uint8)
        if options.get("classes"):
            colours, cls = snap_classes(colours, options["classes"])
            valid = valid & (cls >= 0)
        rgba[..., :3] = colours
    elif render == "grey":
        values = arr[0][valid]
        lo, hi = (np.percentile(values, PHOTO_STRETCH_PCT) if values.size else (0.0, 1.0))
        g = np.clip((arr[0] - lo) / (hi - lo if hi > lo else 1.0) * 255.0, 0, 255).astype(np.uint8)
        rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = g
    else:
        dem = np.where(valid, arr[0], np.nan)
        shade = hillshade(dem, cell_m)
        if render == "hillshade":
            g = (np.nan_to_num(shade) * 255).astype(np.uint8)
            rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = g
        elif render == "elevation":
            lo, hi = float(np.nanmin(dem)), float(np.nanmax(dem))
            colour = _ramp((dem - lo) / (hi - lo if hi > lo else 1.0), options["ramp"])
            lit = colour * (0.55 + 0.45 * np.nan_to_num(shade))[..., None]
            rgba[..., :3] = np.clip(lit, 0, 255).astype(np.uint8)
        elif render == "topo":
            base = 150 + 85 * np.nan_to_num(shade)  # light shading under the lines
            interval = float(options["interval_m"])
            index_every = int(options.get("index_every", 5))
            level = np.floor(np.nan_to_num(dem, nan=0.0) / interval)
            edge = np.zeros_like(level, dtype=bool)
            edge[:, 1:] |= level[:, 1:] != level[:, :-1]
            edge[1:, :] |= level[1:, :] != level[:-1, :]
            index = edge & (np.mod(level, index_every) == 0)
            g = np.where(index, 40, np.where(edge, 95, base))
            rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = np.clip(g, 0, 255).astype(np.uint8)
        else:
            raise ValueError(f"unknown render {render!r}; use one of {RENDERS}")

    rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)
    rgba[~valid, :3] = 0
    return rgba


def export_png(
    src_path: str,
    bounds: tuple[float, float, float, float],
    out_path: str,
    max_px: int = 4096,
    nearest: bool = False,
    render: str = "grey",
    nodata: float | None = None,
    options: dict[str, Any] | None = None,
) -> List[List[float]]:
    """Export a georeferenced raster as an RGBA PNG, with transparent empty/no-data.

    The raster stays in its own projected CRS (never reprojected): the box is converted into
    that CRS and the window of whole cells covering it is read. The longest side is capped at
    ``max_px``; ``scale`` in ``options`` (DEM renders) draws more pixels per cell for a smoother picture.

    Render modes:
        grey: band 1, stretched between the 0.5th and 99.5th percentile (photos).
        rgb: bands 1-3 as colours (class maps); a pixel that is 0 in all three is no data. With
            ``options["classes"]``, pixels snap to the nearest key colour and the rest are transparent.
        hillshade: shading of a height file, light from the north-west.
        elevation: height on ``options["ramp"]`` (hex colours, low to high), lit by the hillshade.
        topo: contours every ``options["interval_m"]`` metres over light shading; every
            ``options["index_every"]``-th line darker.

    Args:
        src_path: Input raster (GeoTIFF), projected CRS.
        bounds: (south, west, north, east) in degrees.
        out_path: Where to write the PNG.
        max_px: Maximum width or height in pixels.
        nearest: Nearest-neighbour resampling (class maps) instead of smooth.
        render: One of ``RENDERS``.
        nodata: Value treated as no data, overriding the file's own (e.g. 0 for a photo with none set).
        options: Extra settings for the render mode (see above), and ``scale``.

    Returns:
        Four corners as [lon, lat] pairs: top-left, top-right, bottom-right, bottom-left
        (MapLibre image-source order), the outer edges of the cells drawn.

    Raises:
        ValueError: no CRS, a geographic CRS, the box does not overlap the file, or an unknown render.
    """
    if render not in RENDERS:
        raise ValueError(f"unknown render {render!r}; use one of {RENDERS}")
    options = options or {}

    with rasterio.open(src_path) as src:
        window, transformer = box_window(src, bounds)

        scale = float(options.get("scale", 1.0))
        out_w = max(1, int(round(window.width * scale)))
        out_h = max(1, int(round(window.height * scale)))
        shrink = max(out_w, out_h) / float(max_px)
        if shrink > 1.0:
            out_w = max(1, int(round(out_w / shrink)))
            out_h = max(1, int(round(out_h / shrink)))

        bands = [1, 2, 3] if render == "rgb" else [1]
        if render == "rgb" and src.count < 3:
            raise ValueError(f"{src_path} has {src.count} band(s); render 'rgb' needs 3")
        if nearest:
            resampling = Resampling.nearest
        elif out_w * out_h > window.width * window.height:
            resampling = Resampling.bilinear  # drawing more pixels than cells: interpolate
        else:
            resampling = Resampling.average
        arr = src.read(bands, window=window, out_dtype=np.float32, out_shape=(len(bands), out_h, out_w), resampling=resampling)

        file_nodata = src.nodatavals[0] if src.nodatavals else None
        nd = nodata if nodata is not None else file_nodata
        if render == "rgb":
            valid = np.any(arr > 0, axis=0)
        else:
            valid = np.isfinite(arr[0])
            if nd is not None:
                # Smooth resampling blends no-data into neighbours; re-read the mask with nearest.
                raw = src.read(1, window=window, out_shape=(out_h, out_w), resampling=Resampling.nearest)
                raw_ok = ~np.isclose(raw, float(nd))
                valid &= raw_ok & ~np.isclose(arr[0], float(nd))
                if raw_ok.any():
                    # A pixel blended with a no-data neighbour falls outside the real values' range.
                    lo, hi = float(raw[raw_ok].min()), float(raw[raw_ok].max())
                    valid &= (arr[0] >= lo) & (arr[0] <= hi)

        out_left, out_bottom, out_right, out_top = window_bounds(window, src.transform)
        cell_m = ((out_right - out_left) / out_w, (out_top - out_bottom) / out_h)

    if not valid.any():
        rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
    else:
        rgba = _render(arr, valid, render, cell_m, options)

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)

    lon_west, lat_south = transformer.transform(out_left, out_bottom, direction="INVERSE")
    lon_east, lat_north = transformer.transform(out_right, out_top, direction="INVERSE")
    return [
        [lon_west, lat_north],  # TL (north-west)
        [lon_east, lat_north],  # TR
        [lon_east, lat_south],  # BR
        [lon_west, lat_south],  # BL (south-west)
    ]


def classes_present(
    src_path: str, bounds: tuple[float, float, float, float], classes: list[dict[str, Any]]
) -> list[dict[str, str]]:
    """Legend entries for the classes of an RGB class map that actually occur inside the box.

    Args:
        src_path: 3-band class map.
        bounds: (south, west, north, east) in degrees.
        classes: ``{"label": str, "colors": ["#rrggbb", ...]}``; any of a class's colours counts
            (e.g. high and medium confidence). The first colour is used in the legend.

    Returns:
        ``[{"color", "label"}]`` in the order given, only for classes covering at least
        ``LEGEND_MIN_SHARE`` of the identified pixels.
    """
    with rasterio.open(src_path) as src:
        window, _ = box_window(src, bounds)
        rgb = src.read([1, 2, 3], window=window).transpose(1, 2, 0)
    _, cls = snap_classes(rgb, classes)
    identified = int((cls >= 0).sum())
    present = {i for i in range(len(classes)) if identified and (cls == i).sum() / identified >= LEGEND_MIN_SHARE}
    return [{"color": c["colors"][0], "label": c["label"]} for i, c in enumerate(classes) if i in present]
