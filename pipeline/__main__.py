"""Main entry point for the pipeline: `python -m pipeline build <manifest.yaml>`"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
import yaml

from pipeline.steps import (
    clip_dem,
    export_png,
    load_dem,
    package_grids,
    slope_deg,
    terrain_tiles,
    write_manifest,
)
from pipeline.steps.overlays import classes_present
from pipeline.steps.units import rasterize_units

# No-data value written into dem.bin and slope.bin (the value used in docs/specs examples).
GRID_NODATA = -9999.0


def _region(config: dict) -> dict:
    """Region block for manifest.json: an explicit ``region``, else the walk box keys (name, bounds, base)."""
    if "region" in config:
        return config["region"]
    return {"name": config["name"], "bounds": config["bounds"], "base": config["base"]}


def _layer_legend(layer: dict, src: str, bounds: tuple, dem: np.ndarray) -> list:
    """Legend for a layer: built from the data where the layer says how, else the YAML legend."""
    render = layer.get("render", "grey")
    if render == "elevation":
        ramp = layer["options"]["ramp"]
        lo, hi = float(np.nanmin(dem)), float(np.nanmax(dem))
        return [{"color": ramp[0], "label": f"{lo:.0f} m (lowest)"}, {"color": ramp[-1], "label": f"{hi:.0f} m (highest)"}]
    if render == "rgb" and "classes" in layer:
        return classes_present(src, bounds, layer["classes"])
    return layer.get("legend", [])


def build(manifest_path: str) -> None:
    """Build all pipeline files from the given manifest configuration.

    Writes grid.json, dem.bin, slope.bin, overlays/*.png and manifest.json into ``out_dir``.
    The clipped height file goes into ``build_dir`` (default ``build/pipeline``), never into the
    web folder. A layer whose source file is missing is left out of the manifest, with a warning.
    """
    config = yaml.safe_load(Path(manifest_path).read_text(encoding="utf-8"))

    out_dir = Path(config["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    build_dir = Path(config.get("build_dir", "build/pipeline"))
    build_dir.mkdir(parents=True, exist_ok=True)
    bounds = tuple(config.get("clip_bounds") or config["bounds"])

    # Step 1: Clip (whole cells of the height file's own 20 m grid)
    dem_tif = build_dir / "clipped.tif"
    meta = clip_dem(config["dem_src"], bounds, str(dem_tif))

    # Step 2: Derive
    dem = load_dem(str(dem_tif))
    slope = slope_deg(dem, meta["res_m"])

    # Step 3: Package
    package_grids(dem, slope, {**meta, "nodata": GRID_NODATA}, str(out_dir))
    print(f"grid: {meta['width']} x {meta['height']} cells at {meta['res_m']} m, bounds {meta['bounds']}")

    # Step 4: Overlays
    layer_results = []
    for layer in config.get("layers", []):
        layer_meta = {k: layer[k] for k in ("id", "name", "group", "type", "url", "credit", "caveat")}
        if "default" in layer:
            layer_meta["default"] = layer["default"]

        if layer["type"] == "image":
            src = layer.get("src")
            if not src or not Path(src).exists():
                print(f"WARNING: skipping layer '{layer['id']}': source file {src!r} not found", file=sys.stderr)
                continue
            if layer.get("render") == "units":
                burned = rasterize_units(
                    src,
                    layer["layer"],
                    layer["field"],
                    str(dem_tif),
                    str(out_dir / layer["url"]),
                    layer["classes"],
                    scale=int(layer.get("options", {}).get("scale", 1)),
                )
                layer_meta["coordinates"] = burned["coordinates"]
                layer_meta["legend"] = burned["legend"]
                layer_results.append(layer_meta)
                print(f"layer: {layer['id']}")
                continue
            layer_meta["coordinates"] = export_png(
                src,
                bounds,
                str(out_dir / layer["url"]),
                max_px=layer.get("max_px", 4096),
                nearest=layer.get("nearest", False),
                render=layer.get("render", "grey"),
                nodata=layer.get("nodata"),
                options={**layer.get("options", {}), **({"classes": layer["classes"]} if "classes" in layer else {})},
            )
            layer_meta["legend"] = _layer_legend(layer, src, bounds, dem)
        elif layer["type"] == "terrain":
            # Tiles go in the folder holding the layer's url (a TileJSON, e.g. terrain/tiles.json).
            tiles_dir = (out_dir / layer["url"]).parent
            shutil.rmtree(tiles_dir, ignore_errors=True)  # no stale tiles from an earlier box or zoom range
            opts = layer.get("options", {})
            t_dem, t_bounds = dem, tuple(meta["bounds"])
            if "bounds" in opts:  # a wider area than the walk box, clipped from the same height file
                t_meta = clip_dem(config["dem_src"], tuple(opts["bounds"]), str(build_dir / "terrain.tif"))
                t_dem, t_bounds = load_dem(str(build_dir / "terrain.tif")), tuple(t_meta["bounds"])
            tj = terrain_tiles(t_dem, t_bounds, str(tiles_dir), int(opts["minzoom"]), int(opts["maxzoom"]))
            print(f"terrain: {tj['tile_count']} tiles, zoom {tj['minzoom']}-{tj['maxzoom']}")
            layer_meta["legend"] = layer.get("legend", [])

        layer_results.append(layer_meta)
        print(f"layer: {layer['id']}")

    # Step 5: Manifest
    write_manifest({**config, "region": _region(config)}, layer_results, str(out_dir / "manifest.json"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Martian Map pipeline data.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("manifest", help="Path to the build configuration YAML")
    args = parser.parse_args()

    if args.command == "build":
        build(args.manifest)


if __name__ == "__main__":
    main()
