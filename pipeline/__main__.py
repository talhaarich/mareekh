"""Main entry point for the pipeline: `python -m pipeline build <manifest.yaml>`"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import yaml

from pipeline.steps import (
    clip_dem,
    export_png,
    load_dem,
    package_grids,
    slope_deg,
    write_manifest,
)


def build(manifest_path: str) -> None:
    """Build all pipeline files from the given manifest configuration."""
    manifest_file = Path(manifest_path)
    config = yaml.safe_load(manifest_file.read_text())

    out_dir = Path(config["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)

    # Need assumptions.json in out_dir for package_grids
    # Look for it in examples/data/jezero if not already in out_dir
    src_assumptions = Path("examples/data/jezero/assumptions.json")
    if not (out_dir / "assumptions.json").exists() and src_assumptions.exists():
        shutil.copy(src_assumptions, out_dir / "assumptions.json")

    # Step 1: Clip
    dem_tif = out_dir / "clipped.tif"
    meta = clip_dem(config["dem_src"], tuple(config["clip_bounds"]), str(dem_tif))

    # Step 2: Derive
    dem = load_dem(str(dem_tif))
    slope = slope_deg(dem, meta["res_m"])

    # Step 3: Package
    package_grids(dem, slope, meta, str(out_dir))

    # Step 4: Overlays
    layer_results = []
    overlays_dir = out_dir / "overlays"
    overlays_dir.mkdir(exist_ok=True)

    for layer in config.get("layers", []):
        layer_meta = {
            "id": layer["id"],
            "name": layer["name"],
            "group": layer["group"],
            "type": layer["type"],
            "url": layer["url"],
            "credit": layer["credit"],
            "caveat": layer["caveat"],
        }
        if "default" in layer:
            layer_meta["default"] = layer["default"]
        if "legend" in layer:
            layer_meta["legend"] = layer["legend"]

        if layer["type"] == "image":
            png_out = out_dir / layer["url"]
            coords = export_png(
                layer["src"],
                tuple(config["clip_bounds"]),
                str(png_out),
                nearest=layer.get("nearest", False),
            )
            layer_meta["coordinates"] = coords

        layer_results.append(layer_meta)

    # Step 5: Manifest
    write_manifest(config, layer_results, str(out_dir / "manifest.json"))


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