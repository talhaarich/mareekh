"""Tests for pipeline/photos.py.

``data/raw_images_sol686.json`` is a real response from the Mars 2020 raw-images feed for
sol 686 (the query ``build_query_url(686)``), saved on 2026-11-14 and trimmed from 127 to 15
images with varied cameras, in feed order. Nothing else in it was changed.
Small hand-built payloads below test the rules on cameras that sol 686 does not have.
"""

import json
from pathlib import Path

import pytest

from pipeline.photos import (
    DEFAULT_CREDIT,
    SKIP_CAMERA_PREFIXES,
    PhotosError,
    build_query_url,
    camera_family,
    parse_raw_images,
    photos_for_sol,
)

SOL686 = json.loads((Path(__file__).parent / "data" / "raw_images_sol686.json").read_text(encoding="utf-8"))


def fake_fetch(url: str) -> dict:
    return SOL686


def item(camera: str, n: int, **extra) -> dict:
    """One hand-built feed image (same shape as the real feed) for sol 686."""
    return {"sol": 686, "sample_type": "Full", "camera": {"instrument": camera}, "credit": "NASA/JPL-Caltech",
            "image_files": {"large": f"https://example.invalid/{camera}_{n}.jpg"}, **extra}


def cameras(payload: dict, max_n: int) -> list[str]:
    return [p["camera"] for p in parse_raw_images(payload, 686, max_n)]


def test_real_response_has_the_fields_the_parser_reads():
    assert SOL686["sol"] == 686 and len(SOL686["images"]) == 15
    for image in SOL686["images"]:
        assert image["sol"] == 686 and image["sample_type"] == "Full"
        assert image["camera"]["instrument"] and image["credit"]
        assert {"small", "medium", "large", "full_res"} <= set(image["image_files"])


def test_at_most_max_n_and_each_has_credit():
    for max_n in (0, 1, 2, 3, 20):
        photos = photos_for_sol(686, max_n, fetch=fake_fetch)
        assert len(photos) <= max_n
        for p in photos:
            assert set(p) == {"url", "camera", "sol", "credit"}
            assert p["credit"].strip()
            assert p["sol"] == 686
            assert p["url"].startswith("https://mars.nasa.gov/") and p["url"].endswith("_1200.jpg")  # "large" size


def test_real_sol_686_choice():
    assert [p["camera"] for p in photos_for_sol(686, fetch=fake_fetch)] == ["NAVCAM_LEFT", "MCZ_RIGHT", "FRONT_HAZCAM_LEFT_A"]
    assert len(photos_for_sol(686, 20, fetch=fake_fetch)) == 12  # 15 minus 2 SUPERCAM_RMI and 1 SKYCAM


def test_skipped_cameras_never_chosen():
    real = cameras(SOL686, 20)
    assert not any(c.startswith(("SUPERCAM_RMI", "SKYCAM")) for c in real)
    skipped = ["SUPERCAM_RMI", "SHERLOC_WATSON", "SHERLOC_ACI", "CACHECAM", "SKYCAM", "EDL_RDCAM", "EDL_PUCAM1", "LCAM"]
    assert all(c.startswith(SKIP_CAMERA_PREFIXES) for c in skipped)
    payload = {"images": [item(c, i) for i, c in enumerate(skipped)] + [item("PIXL_MCC", 99)]}
    assert cameras(payload, 10) == ["PIXL_MCC"]


def test_preferred_cameras_come_first_in_order():
    feed_order = ["PIXL_MCC", "REAR_HAZCAM_LEFT", "FRONT_HAZCAM_LEFT_A", "MCZ_LEFT", "NAVCAM_LEFT"]
    payload = {"images": [item(c, i) for i, c in enumerate(feed_order)]}
    assert cameras(payload, 5) == ["NAVCAM_LEFT", "MCZ_LEFT", "FRONT_HAZCAM_LEFT_A", "REAR_HAZCAM_LEFT", "PIXL_MCC"]
    assert cameras(SOL686, 4) == ["NAVCAM_LEFT", "MCZ_RIGHT", "FRONT_HAZCAM_LEFT_A", "REAR_HAZCAM_LEFT"]


def test_stereo_pair_counts_as_one_camera():
    for left, right in (("MCZ_LEFT", "MCZ_RIGHT"), ("NAVCAM_LEFT", "NAVCAM_RIGHT"), ("FRONT_HAZCAM_LEFT_A", "FRONT_HAZCAM_RIGHT_A")):
        assert camera_family(left) == camera_family(right)
    payload = {"images": [item("NAVCAM_LEFT", 0), item("NAVCAM_RIGHT", 1), item("MCZ_LEFT", 2), item("MCZ_RIGHT", 3), item("PIXL_MCC", 4)]}
    assert cameras(payload, 3) == ["NAVCAM_LEFT", "MCZ_LEFT", "PIXL_MCC"]  # first pass: one per family
    assert cameras(payload, 5) == ["NAVCAM_LEFT", "MCZ_LEFT", "PIXL_MCC", "NAVCAM_RIGHT", "MCZ_RIGHT"]  # then fill up


def test_thumbnail_other_sol_and_no_url_dropped():
    payload = {"images": [
        item("NAVCAM_LEFT", 0, sample_type="Thumbnail"),
        item("NAVCAM_LEFT", 1, sol=687),
        item("NAVCAM_LEFT", 2, image_files={}),
        item("MCZ_LEFT", 3),
    ]}
    assert cameras(payload, 10) == ["MCZ_LEFT"]


def test_missing_credit_gets_the_mission_credit():
    no_credit = item("NAVCAM_LEFT", 0)
    del no_credit["credit"]
    assert parse_raw_images({"images": [no_credit]}, 686, 1)[0]["credit"] == DEFAULT_CREDIT


def test_no_images_for_sol_gives_empty_list():
    assert photos_for_sol(5, 3, fetch=fake_fetch) == []


def test_bad_response_and_bad_sol_raise():
    with pytest.raises(PhotosError):
        parse_raw_images({"nope": 1}, 686, 3)
    with pytest.raises(ValueError):
        photos_for_sol(-1, fetch=fake_fetch)
    with pytest.raises(ValueError):
        parse_raw_images(SOL686, 686, -1)


def test_fetch_failure_is_a_photos_error():
    def boom(url: str) -> dict:
        raise PhotosError("down")

    with pytest.raises(PhotosError):
        photos_for_sol(686, fetch=boom)


def test_query_url_names_the_sol():
    url = build_query_url(686)
    assert "mars2020" in url and "sol=686" in url
