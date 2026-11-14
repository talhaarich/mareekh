"""Rover photos for a station, from NASA's Mars 2020 raw-images feed.

NASA's "Mars Rover Photos" API (api.nasa.gov/mars-photos) was retired and its
repository archived on 8 Oct 2025, so this module uses the Mars 2020 raw-images
JSON feed on mars.nasa.gov instead.

Checked against a live response for sol 686 (saved, trimmed, in
tests/pipeline/data/raw_images_sol686.json): the query below returns
``{"sol", "images", "num_images", "type", "most_recent", "mission"}``, and each image
has ``sol`` (int), ``sample_type`` (``"Full"`` for every sol-686 image),
``camera.instrument`` (e.g. ``NAVCAM_LEFT``, ``MCZ_RIGHT``), ``credit`` and
``image_files`` with ``small``, ``medium``, ``large`` and ``full_res`` URLs.

Photo choice: cameras that do not show the scene around a station are skipped
(``SKIP_CAMERA_PREFIXES``); the rest are ranked by ``PREFERRED_CAMERA_PREFIXES``;
a stereo pair (left and right of one camera) counts as one camera.

Output items: ``{"url": str, "camera": str, "sol": int, "credit": str}``.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Callable

FEED_URL = "https://mars.nasa.gov/rss/api/"
# Mission-wide credit line for NASA raw images; used only when an item has no credit field.
DEFAULT_CREDIT = "NASA/JPL-Caltech"
_URL_SIZES = ("large", "medium", "full_res", "small")  # preference order
_FETCH_COUNT = 100  # images requested per sol; we keep at most max_n of them

# Close-up, sky, sampling-system and landing cameras: not a view of the station.
SKIP_CAMERA_PREFIXES = ("SUPERCAM_RMI", "SHERLOC", "CACHECAM", "SKYCAM", "EDL", "LCAM")
# Most useful first. Any other camera ranks after these, in feed order.
PREFERRED_CAMERA_PREFIXES = ("NAVCAM", "MCZ", "FRONT_HAZCAM", "REAR_HAZCAM")


class PhotosError(RuntimeError):
    """Raised when the feed cannot be reached or returns something unreadable."""


def build_query_url(sol: int, count: int = _FETCH_COUNT) -> str:
    """Return the feed URL asking for Mars 2020 images taken on exactly ``sol``."""
    params = {
        "feed": "raw_images",
        "category": "mars2020",
        "feedtype": "json",
        "num": str(count),
        "page": "0",
        "search": "",
        "sol": str(sol),
        "order": "sol asc,date_taken asc",
    }
    return FEED_URL + "?" + urllib.parse.urlencode(params)


def _pick_url(item: dict[str, Any]) -> str | None:
    files = item.get("image_files") or {}
    for size in _URL_SIZES:
        url = files.get(size)
        if isinstance(url, str) and url.startswith("http"):
            return url
    return None


def camera_rank(camera: str) -> int:
    """Position of ``camera`` in ``PREFERRED_CAMERA_PREFIXES``; cameras not listed rank after all of them."""
    for rank, prefix in enumerate(PREFERRED_CAMERA_PREFIXES):
        if camera.startswith(prefix):
            return rank
    return len(PREFERRED_CAMERA_PREFIXES)


def camera_family(camera: str) -> str:
    """The camera with its stereo side removed: ``MCZ_LEFT`` and ``MCZ_RIGHT`` are both ``MCZ``.

    A listed camera's family is its prefix in ``PREFERRED_CAMERA_PREFIXES`` (so the hazard
    cameras' ``FRONT_HAZCAM_LEFT_A`` and ``FRONT_HAZCAM_RIGHT_A`` are one family too).
    """
    for prefix in PREFERRED_CAMERA_PREFIXES:
        if camera.startswith(prefix):
            return prefix
    return "_".join(part for part in camera.split("_") if part not in ("LEFT", "RIGHT"))


def parse_raw_images(payload: dict, sol: int, max_n: int) -> list[dict]:
    """Turn a feed response into at most ``max_n`` photo dicts for ``sol``.

    Skips thumbnails, other sols, items with no usable URL and cameras in
    ``SKIP_CAMERA_PREFIXES``. Orders the rest by ``camera_rank`` (feed order within a
    rank), takes one image per camera family first so the station card shows
    different views, then fills up in the same order.
    """
    if max_n < 0:
        raise ValueError("max_n must be 0 or more")
    images = payload.get("images") if isinstance(payload, dict) else None
    if not isinstance(images, list):
        raise PhotosError("response has no 'images' list")

    candidates: list[dict] = []
    seen_urls: set[str] = set()
    for item in images:
        if not isinstance(item, dict) or item.get("sol") is None:
            continue
        try:
            item_sol = int(item["sol"])
        except (TypeError, ValueError):
            continue
        if item_sol != sol or str(item.get("sample_type", "")).lower() == "thumbnail":
            continue
        url = _pick_url(item)
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        camera = str((item.get("camera") or {}).get("instrument") or "unknown")
        if camera.startswith(SKIP_CAMERA_PREFIXES):
            continue
        candidates.append({"url": url, "camera": camera, "sol": sol, "credit": str(item.get("credit") or DEFAULT_CREDIT)})

    candidates.sort(key=lambda photo: camera_rank(photo["camera"]))  # stable: feed order within a rank
    chosen: list[dict] = []
    used_families: set[str] = set()
    for photo in candidates:  # first pass: one per camera family
        family = camera_family(photo["camera"])
        if len(chosen) < max_n and family not in used_families:
            chosen.append(photo)
            used_families.add(family)
    for photo in candidates:  # second pass: fill remaining places
        if len(chosen) < max_n and photo not in chosen:
            chosen.append(photo)
    return chosen


def _fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "martian-map-pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 (fixed https URL)
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # network, HTTP and JSON errors all mean "no photos"
        raise PhotosError(f"could not fetch photos for {url}: {exc}") from exc


def photos_for_sol(sol: int, max_n: int = 3, *, fetch: Callable[[str], dict] | None = None) -> list[dict]:
    """Return up to ``max_n`` photos taken by Perseverance on ``sol``.

    Each item has ``url``, ``camera``, ``sol`` and ``credit``. ``fetch`` replaces the
    network call (tests pass a function returning a saved response). An empty list
    means the feed had no usable image for that sol; a failure raises ``PhotosError``.
    """
    if isinstance(sol, bool) or not isinstance(sol, int) or sol < 0:
        raise ValueError(f"sol must be a non-negative integer, got {sol!r}")
    payload = (fetch or _fetch_json)(build_query_url(sol))
    return parse_raw_images(payload, sol, max_n)
