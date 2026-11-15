"""Tests for pipeline.steps.write_manifest."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.steps.write_manifest import write_manifest

REPO = Path(__file__).resolve().parents[2]
EXAMPLES_JEZERO = REPO / "examples" / "data" / "jezero"


def test_write_manifest_shape(tmp_path: Path) -> None:
    config = {
        "region": {
            "name": "Jezero Crater, western delta",
            "bounds": [18.41, 77.38, 18.512, 77.522],
            "base": {"lat": 18.4446, "lon": 77.4509},
        }
    }
    layer_results = [
        {
            "id": "satellite",
            "name": "Satellite",
            "group": "view",
            "type": "image",
            "url": "overlays/satellite.png",
            "coordinates": [
                [77.38, 18.512],
                [77.522, 18.512],
                [77.522, 18.41],
                [77.38, 18.41],
            ],
            "default": True,
            "legend": [],
            "credit": "NASA/JPL-Caltech/MSSS/USGS (CTX mosaic)",
            "caveat": "5 m per pixel. Rocks are not visible.",
        }
    ]
    out = tmp_path / "manifest.json"
    write_manifest(config, layer_results, str(out))
    assert out.is_file()
    data = json.loads(out.read_text())
    assert data["region"] == config["region"]
    assert len(data["layers"]) == 1
    assert data["layers"][0]["id"] == "satellite"
    assert data["layers"][0]["credit"] == layer_results[0]["credit"]
    assert data["layers"][0]["caveat"] == layer_results[0]["caveat"]


def test_every_layer_must_have_credit_and_caveat(tmp_path: Path) -> None:
    config = {"region": {"name": "Test", "bounds": [0, 0, 1, 1], "base": {"lat": 0, "lon": 0}}}
    # Missing credit
    with pytest.raises(ValueError, match="missing required 'credit'"):
        write_manifest(
            config,
            [
                {
                    "id": "test",
                    "name": "Test",
                    "group": "view",
                    "type": "image",
                    "url": "test.png",
                    "coordinates": [[0, 0], [1, 0], [1, 1], [0, 1]],
                    "legend": [],
                    "caveat": "ok",
                }
            ],
            str(tmp_path / "out.json"),
        )
    # Missing caveat
    with pytest.raises(ValueError, match="missing required 'caveat' field"):
        write_manifest(
            config,
            [
                {
                    "id": "test",
                    "name": "Test",
                    "group": "view",
                    "type": "image",
                    "url": "test.png",
                    "coordinates": [[0, 0], [1, 0], [1, 1], [0, 1]],
                    "legend": [],
                    "credit": "ok",
                }
            ],
            str(tmp_path / "out.json"),
        )
    # Empty credit string
    with pytest.raises(ValueError, match="missing required 'credit'"):
        write_manifest(
            config,
            [
                {
                    "id": "test",
                    "name": "Test",
                    "group": "view",
                    "type": "image",
                    "url": "test.png",
                    "coordinates": [[0, 0], [1, 0], [1, 1], [0, 1]],
                    "legend": [],
                    "credit": "",
                    "caveat": "ok",
                }
            ],
            str(tmp_path / "out.json"),
        )
    # Empty caveat string is allowed (field exists)
    write_manifest(
        config,
        [
            {
                "id": "test",
                "name": "Test",
                "group": "view",
                "type": "image",
                "url": "test.png",
                "coordinates": [[0, 0], [1, 0], [1, 1], [0, 1]],
                "legend": [],
                "credit": "ok",
                "caveat": "",
            }
        ],
        str(tmp_path / "out.json"),
    )


def test_matches_example_manifest_shape(tmp_path: Path) -> None:
    example = json.loads((EXAMPLES_JEZERO / "manifest.json").read_text())
    config = {"region": example["region"]}
    layer_results = example["layers"]
    out = tmp_path / "manifest.json"
    write_manifest(config, layer_results, str(out))
    written = json.loads(out.read_text())
    # Same keys, same layer count, each layer has credit and caveat
    assert set(written.keys()) == {"region", "layers"}
    assert len(written["layers"]) == len(example["layers"])
    for layer in written["layers"]:
        assert "credit" in layer and layer["credit"]
        assert "caveat" in layer
        assert layer["group"] in ("view", "overlay")
        assert layer["type"] in ("image", "terrain")