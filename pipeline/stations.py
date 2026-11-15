"""Station positions for the Martian Map walk.

Turns a Perseverance waypoint file (GeoJSON, parsed to a dict) plus the team's
``pipeline/stations.yaml`` into ``stations.json`` (see docs/specs/CONTRACTS.md).

Units: degrees for latitude/longitude, metres for distances, seconds for time.
Coordinates are planetocentric, longitude positive east (CONVENTIONS.md).

Waypoint layout, checked against ``data/raw/M20_waypoints.json`` (NASA/JPL,
https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json, FeatureCollection
``M20_waypoints_sol2022_all``, 708 features): every feature has a Point geometry
``[lon, lat, elev_geoid]`` and properties including ``sol``, ``site``, ``drive`` (all
integers), ``lat``, ``lon`` (degrees, same values as the geometry) and ``elev_geoid`` (m).
Features are in rover order, sorted by sol and by (site, drive). 125 sols have more than
one feature (up to 4), and ``drive`` restarts at 0 when a new site starts, which can happen
at the end of a sol. Properties ``lat``/``lon`` are read first; the Point geometry is the
fallback when they are missing.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Callable

import yaml


class StationError(ValueError):
    """Raised for a missing sol, a bad waypoint, or a station outside the box."""


def _parse_sol(value: Any) -> int | None:
    """Return ``value`` as an int sol, or None if it is not a whole number."""
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(as_float) or as_float != int(as_float):
        return None
    return int(as_float)


def _feature_latlon(feature: dict[str, Any]) -> tuple[float, float]:
    """Return (lat, lon) in degrees from one waypoint feature."""
    props = feature.get("properties") or {}
    lat, lon = props.get("lat"), props.get("lon")
    if lat is None or lon is None:
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates")
        if geom.get("type") != "Point" or not coords or len(coords) < 2:
            raise StationError("waypoint has no lat/lon in properties and no Point geometry")
        lon, lat = coords[0], coords[1]  # GeoJSON order is [lon, lat]
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError) as exc:
        raise StationError(f"waypoint lat/lon are not numbers: {lat!r}, {lon!r}") from exc
    if not (math.isfinite(lat) and math.isfinite(lon)) or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise StationError(f"waypoint lat/lon out of range: lat={lat}, lon={lon}")
    return lat, lon


def _order_key(value: Any) -> float:
    """``value`` as a number for ordering waypoints (site or drive); -inf when absent or not a number."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("-inf")


def station_from_sol(waypoints: dict, sol: int) -> tuple[float, float]:
    """Return the rover position at the end of ``sol`` as ``(lat, lon)`` in degrees.

    ``waypoints`` is the parsed waypoint GeoJSON. When several waypoints share a
    sol, the last one in rover order is used: highest ``properties.site``, then highest
    ``properties.drive`` within it (file order breaks ties, and decides when neither
    number exists). That is where the rover finished the sol. Drive alone is not enough:
    on 21 sols of the real file the sol ends at a new site with drive 0.

    Raises:
        StationError: if no waypoint exists for ``sol`` or its position is invalid.
    """
    if isinstance(sol, bool) or not isinstance(sol, int):
        raise StationError(f"sol must be an integer, got {sol!r}")
    features = waypoints.get("features") if isinstance(waypoints, dict) else None
    if not isinstance(features, list) or not features:
        raise StationError("waypoints has no 'features' list")

    matches: list[tuple[float, float, int, dict[str, Any]]] = []
    known_sols: set[int] = set()
    for index, feature in enumerate(features):
        feature_sol = _parse_sol((feature.get("properties") or {}).get("sol"))
        if feature_sol is None:
            continue
        known_sols.add(feature_sol)
        if feature_sol == sol:
            props = feature.get("properties") or {}
            matches.append((_order_key(props.get("site")), _order_key(props.get("drive")), index, feature))

    if not matches:
        nearest = sorted(known_sols, key=lambda s: abs(s - sol))[:3]
        raise StationError(f"no waypoint for sol {sol}; nearest sols in the file: {sorted(nearest)}")
    matches.sort(key=lambda m: (m[0], m[1], m[2]))
    return _feature_latlon(matches[-1][3])


def margin_to_box_m(lat: float, lon: float, bounds: list[float], mars_radius_m: float) -> float:
    """Distance in metres from a point to the nearest box edge; negative if outside.

    ``bounds`` is ``[south, west, north, east]`` in degrees. Uses a small-angle
    sphere of radius ``mars_radius_m`` (read it from assumptions.json, do not type it).
    """
    south, west, north, east = bounds
    per_degree_m = mars_radius_m * math.pi / 180.0
    north_south = min(lat - south, north - lat) * per_degree_m
    east_west = min(lon - west, east - lon) * per_degree_m * math.cos(math.radians(lat))
    return min(north_south, east_west)


def box_containing(points: list[tuple[float, float]], margin_m: float, mars_radius_m: float) -> list[float]:
    """Smallest ``[south, west, north, east]`` box with ``margin_m`` spare around every (lat, lon) point."""
    if not points:
        raise StationError("no points to build a box from")
    per_degree_m = mars_radius_m * math.pi / 180.0
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    dlat = margin_m / per_degree_m
    south, north = min(lats) - dlat, max(lats) + dlat
    widest_lat = max(abs(south), abs(north))
    dlon = margin_m / (per_degree_m * math.cos(math.radians(widest_lat)))
    return [south, min(lons) - dlon, north, max(lons) + dlon]


def _require_int(value: Any, name: str, station_id: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise StationError(f"{station_id}: '{name}' must be an integer, got {value!r}")
    return value


def build_stations(
    stations_yaml: str | Path,
    jezero_yaml: str | Path,
    waypoints: dict,
    out_path: str | Path,
    *,
    mars_radius_m: float,
    photos_fn: Callable[[int], list[dict]] | None = None,
    margin_m: float = 500.0,
) -> list[dict]:
    """Build and write ``stations.json``; returns the station list.

    Base comes from ``jezero_yaml`` (``base: {lat, lon}``) and the box from its
    ``bounds``. Every station position comes from ``station_from_sol``. Base and
    every station must sit at least ``margin_m`` metres inside the box.
    ``photos_fn(sol)`` fills ``photos`` (use ``photos.photos_for_sol``); without it
    ``photos`` is an empty list.

    A station that is not a rover stop (a feature from the geologic map, say) gives ``lat`` and
    ``lon`` and a ``source`` instead of ``sol``: its ``sol`` is null and it has no rover photos. Output keys follow CONTRACTS.md (``dwell_s``, not camelCase).
    """
    jezero = yaml.safe_load(Path(jezero_yaml).read_text(encoding="utf-8")) or {}
    bounds = jezero.get("bounds")
    base = jezero.get("base") or {}
    if not bounds or len(bounds) != 4 or any(not isinstance(b, (int, float)) for b in bounds):
        raise StationError("jezero.yaml 'bounds' is not set yet; walk the box corners first (task 4)")
    if not isinstance(base.get("lat"), (int, float)) or not isinstance(base.get("lon"), (int, float)):
        raise StationError("jezero.yaml 'base' needs numeric lat and lon")

    spec = yaml.safe_load(Path(stations_yaml).read_text(encoding="utf-8")) or {}
    entries = spec.get("stations")
    if not isinstance(entries, list) or not entries:
        raise StationError("stations.yaml needs a non-empty 'stations' list")

    stations: list[dict] = [
        {
            "id": "B",
            "name": str(jezero.get("base_name", "Base")),
            "lat": float(base["lat"]),
            "lon": float(base["lon"]),
            "task": "Start and end of the walk.",
            "dwell_s": 0,
            "sol": None,
            "photos": [],
        }
    ]
    for number, entry in enumerate(entries, start=1):
        expected_id = f"S{number}"
        if entry.get("id") != expected_id:
            raise StationError(f"stations.yaml entry {number} has id {entry.get('id')!r}, expected {expected_id!r} (walking order)")
        dwell_s = _require_int(entry.get("dwell_s"), "dwell_s", expected_id)
        for key in ("name", "task"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                raise StationError(f"{expected_id}: '{key}' is missing")
        if "sol" in entry:
            sol: int | None = _require_int(entry.get("sol"), "sol", expected_id)
            lat, lon = station_from_sol(waypoints, sol)
        else:
            if not all(isinstance(entry.get(k), (int, float)) for k in ("lat", "lon")):
                raise StationError(f"{expected_id}: give a 'sol', or 'lat' and 'lon' with a 'source'")
            if not isinstance(entry.get("source"), str) or not entry["source"].strip():
                raise StationError(f"{expected_id}: a position without a sol needs a 'source'")
            sol, lat, lon = None, float(entry["lat"]), float(entry["lon"])
        stations.append(
            {
                "id": expected_id,
                "name": entry["name"],
                "lat": lat,
                "lon": lon,
                "task": entry["task"],
                "dwell_s": dwell_s,
                "sol": sol,
                "photos": photos_fn(sol) if photos_fn and sol is not None else [],
            }
        )

    for station in stations:
        margin = margin_to_box_m(station["lat"], station["lon"], bounds, mars_radius_m)
        if margin < margin_m:
            raise StationError(f"{station['id']} is only {margin:.0f} m inside the box (need {margin_m:.0f} m)")

    Path(out_path).write_text(json.dumps(stations, indent=2) + "\n", encoding="utf-8")
    return stations
