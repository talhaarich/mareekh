"""Rover photos for a station, from NASA's Mars 2020 raw-image feed.

NASA's "Mars Rover Photos" API (api.nasa.gov/mars-photos) was retired and its
repository archived on 8 Oct 2025, so this module uses the Mars 2020 raw-images
JSON feed on mars.nasa.gov instead.

UNVERIFIED: the shell here could not reach NASA, so the query string and the
response field names below (``images``, ``sol``, ``camera.instrument``,
``image_files``, ``sample_type``, ``credit``) come from memory of the feed, not a
live response. Check them against one real response before relying on this
(docs/chat-posts.md, item BLOCKED-photos).

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


def parse_raw_images(payload: dict, sol: int, max_n: int) -> list[dict]:
    """Turn a feed response into at most ``max_n`` photo dicts for ``sol``.

    Skips thumbnails, other sols, and items with no usable URL. Prefers one image
    per camera first so the station card shows different views, then fills up.
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
        camera = (item.get("camera") or {}).get("instrument") or "unknown"
        candidates.append({"url": url, "camera": str(camera), "sol": sol, "credit": str(item.get("credit") or DEFAULT_CREDIT)})

    chosen: list[dict] = []
    used_cameras: set[str] = set()
    for photo in candidates:  # first pass: one per camera
        if len(chosen) < max_n and photo["camera"] not in used_cameras:
            chosen.append(photo)
            used_cameras.add(photo["camera"])
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
