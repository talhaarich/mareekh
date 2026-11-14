"""Write the manifest.json file for the app to load.

Docs: docs/specs/CONTRACTS.md (manifest.json structure),
docs/specs/CONVENTIONS.md (layer ids, coordinate order).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_manifest(
    config: dict[str, Any],
    layer_results: list[dict[str, Any]],
    out_path: str,
) -> None:
    """Write ``manifest.json`` as specified in docs/specs/CONTRACTS.md.

    Args:
        config: Build configuration containing ``region`` with ``name``, ``bounds``
            ([south, west, north, east] in degrees), and ``base`` ({lat, lon}).
        layer_results: List of layer dicts from the pipeline steps. Each must have
            ``id``, ``name``, ``group`` (\"view\" or \"overlay\"), ``type``
            (\"image\" or \"terrain\"), ``url``, ``coordinates`` (four [lon, lat]
            pairs: TL, TR, BR, BL; omitted for ``terrain``), optional ``default``,
            ``legend``, required ``credit``, required ``caveat``.
        out_path: Where to write ``manifest.json``.

    Raises:
        ValueError: any layer is missing a ``credit`` string or has no ``caveat``
            field (even if empty).
    """
    region = config["region"]
    layers = []

    for layer in layer_results:
        if "credit" not in layer or not layer["credit"]:
            raise ValueError(f"layer '{layer.get('id', '?')}' is missing required 'credit'")
        if "caveat" not in layer:
            raise ValueError(f"layer '{layer.get('id', '?')}' is missing required 'caveat' field")

        layers.append(
            {
                "id": layer["id"],
                "name": layer["name"],
                "group": layer["group"],
                "type": layer["type"],
                "url": layer["url"],
                "coordinates": layer.get("coordinates"),
                "default": layer.get("default", False),
                "legend": layer.get("legend", []),
                "credit": layer["credit"],
                "caveat": layer["caveat"],
            }
        )

    manifest = {"region": region, "layers": layers}
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(manifest, indent=2) + "\n")