"""Tests for pipeline/stations.py. Waypoints here are a hand-built sample, not NASA data."""

import json

import pytest
import yaml

from pipeline.stations import (
    StationError,
    box_containing,
    build_stations,
    margin_to_box_m,
    station_from_sol,
)

# Sample only. Radius is passed in, as the real code must read it from assumptions.json.
R = 3_396_190.0

WAYPOINTS = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "properties": {"sol": 0, "drive": 0, "lat": 18.4446, "lon": 77.4509}, "geometry": None},
        {"type": "Feature", "properties": {"sol": 10, "drive": 5, "lat": 18.4450, "lon": 77.4510}, "geometry": None},
        {"type": "Feature", "properties": {"sol": 10, "drive": 6, "lat": 18.4455, "lon": 77.4515}, "geometry": None},
        {"type": "Feature", "properties": {"sol": "20", "lat": 18.4470, "lon": 77.4530}, "geometry": None},
        {"type": "Feature", "properties": {"sol": 30}, "geometry": {"type": "Point", "coordinates": [77.4560, 18.4480]}},
    ],
}

BOX = [18.40, 77.40, 18.50, 77.50]  # [south, west, north, east], sample


def test_position_for_a_sol():
    assert station_from_sol(WAYPOINTS, 0) == (18.4446, 77.4509)


def test_last_drive_of_the_sol_wins():
    assert station_from_sol(WAYPOINTS, 10) == (18.4455, 77.4515)


def test_new_site_at_end_of_sol_wins_over_a_higher_drive():
    # Shape of real sol 409: drive 2746 at site 21, then an end-of-drive localization starts site 22 at drive 0.
    waypoints = {"features": [
        {"properties": {"sol": 409, "site": 21, "drive": 2746, "lat": 18.40, "lon": 77.40}},
        {"properties": {"sol": 409, "site": 22, "drive": 0, "lat": 18.41, "lon": 77.41}},
    ]}
    assert station_from_sol(waypoints, 409) == (18.41, 77.41)


def test_string_sol_and_geometry_fallback():
    assert station_from_sol(WAYPOINTS, 20) == (18.4470, 77.4530)
    assert station_from_sol(WAYPOINTS, 30) == (18.4480, 77.4560)  # (lat, lon) from [lon, lat]


def test_unknown_sol_raises_clear_error():
    with pytest.raises(StationError, match="no waypoint for sol 999"):
        station_from_sol(WAYPOINTS, 999)


def test_bad_inputs_raise():
    with pytest.raises(StationError):
        station_from_sol({}, 1)
    with pytest.raises(StationError):
        station_from_sol(WAYPOINTS, "10")  # type: ignore[arg-type]
    bad = {"features": [{"properties": {"sol": 1, "lat": 95, "lon": 77}}]}
    with pytest.raises(StationError, match="out of range"):
        station_from_sol(bad, 1)


def test_station_points_are_inside_the_box_with_margin():
    for sol in (0, 10, 20, 30):
        lat, lon = station_from_sol(WAYPOINTS, sol)
        assert margin_to_box_m(lat, lon, BOX, R) >= 500


def test_margin_is_negative_outside():
    assert margin_to_box_m(18.60, 77.45, BOX, R) < 0


def test_box_containing_gives_margin_to_every_point():
    points = [station_from_sol(WAYPOINTS, s) for s in (0, 10, 20, 30)]
    box = box_containing(points, 500, R)
    for lat, lon in points:
        assert margin_to_box_m(lat, lon, box, R) >= 500 - 1e-6


def _write_inputs(tmp_path, bounds, dwell=600, sol=20):
    jez = tmp_path / "jezero.yaml"
    jez.write_text(yaml.safe_dump({"bounds": bounds, "base": {"lat": 18.4446, "lon": 77.4509}}))
    st = tmp_path / "stations.yaml"
    st.write_text(yaml.safe_dump({"stations": [{"id": "S1", "name": "Sample", "task": "Do a thing.", "dwell_s": dwell, "sol": sol}]}))
    return jez, st


def test_build_stations_writes_contract_fields(tmp_path):
    jez, st = _write_inputs(tmp_path, BOX)
    out = tmp_path / "stations.json"
    result = build_stations(st, jez, WAYPOINTS, out, mars_radius_m=R, photos_fn=lambda sol: [{"url": "u", "camera": "c", "sol": sol, "credit": "x"}])
    data = json.loads(out.read_text())
    assert data == result
    assert [s["id"] for s in data] == ["B", "S1"]
    assert set(data[1]) == {"id", "name", "lat", "lon", "task", "dwell_s", "sol", "photos"}
    assert data[0]["dwell_s"] == 0 and data[0]["sol"] is None
    assert (data[1]["lat"], data[1]["lon"]) == (18.4470, 77.4530)
    assert data[1]["photos"][0]["sol"] == 20


def test_build_fails_when_station_too_close_to_edge(tmp_path):
    jez, st = _write_inputs(tmp_path, [18.4466, 77.40, 18.50, 77.50])  # S1 only ~70 m from the south edge
    with pytest.raises(StationError, match="inside the box"):
        build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R)


def test_build_fails_when_box_unset_or_dwell_missing(tmp_path):
    jez, st = _write_inputs(tmp_path, None)
    with pytest.raises(StationError, match="bounds"):
        build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R)
    jez, st = _write_inputs(tmp_path, BOX, dwell=None)
    with pytest.raises(StationError, match="dwell_s"):
        build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R)


def test_build_fails_on_unknown_sol(tmp_path):
    jez, st = _write_inputs(tmp_path, BOX, sol=999)
    with pytest.raises(StationError, match="no waypoint for sol 999"):
        build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R)


def test_a_mapped_feature_station_takes_lat_lon_and_has_no_sol(tmp_path):
    jez, st = _write_inputs(tmp_path, BOX)
    spec = yaml.safe_load(open(st, encoding="utf-8"))
    spec["stations"].append(
        {"id": "S2", "name": "Crater", "lat": 18.45, "lon": 77.45, "source": "USGS SIM 3464", "dwell_s": 600, "task": "Look."}
    )
    open(st, "w", encoding="utf-8").write(yaml.safe_dump(spec))
    data = build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R, photos_fn=lambda sol: [{"sol": sol}])
    assert data[2] == {"id": "S2", "name": "Crater", "lat": 18.45, "lon": 77.45, "task": "Look.", "dwell_s": 600, "sol": None, "photos": []}


def test_a_station_without_sol_needs_position_and_source(tmp_path):
    jez, st = _write_inputs(tmp_path, BOX)
    spec = yaml.safe_load(open(st, encoding="utf-8"))
    spec["stations"].append({"id": "S2", "name": "Crater", "lat": 18.45, "lon": 77.45, "dwell_s": 600, "task": "Look."})
    open(st, "w", encoding="utf-8").write(yaml.safe_dump(spec))
    with pytest.raises(StationError, match="source"):
        build_stations(st, jez, WAYPOINTS, tmp_path / "o.json", mars_radius_m=R)
