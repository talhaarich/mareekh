"""Tests for pipeline/photos.py against a saved (hand-built, unverified) sample response."""

import json
from pathlib import Path

import pytest

from pipeline.photos import PhotosError, build_query_url, parse_raw_images, photos_for_sol

SAMPLE = json.loads((Path(__file__).parent / "data" / "raw_images_sample_UNVERIFIED.json").read_text())


def fake_fetch(url: str) -> dict:
    return SAMPLE


def test_at_most_max_n_and_each_has_credit():
    for max_n in (0, 1, 2, 3, 10):
        photos = photos_for_sol(690, max_n, fetch=fake_fetch)
        assert len(photos) <= max_n
        for p in photos:
            assert set(p) == {"url", "camera", "sol", "credit"}
            assert p["credit"].strip()
            assert p["sol"] == 690
            assert p["url"].startswith("http")


def test_default_max_n_is_three():
    assert len(photos_for_sol(690, fetch=fake_fetch)) == 3


def test_one_image_per_camera_first_and_junk_skipped():
    photos = photos_for_sol(690, 3, fetch=fake_fetch)
    assert [p["camera"] for p in photos] == ["MCZ_LEFT", "NAVCAM_LEFT", "FRONT_HAZCAM_LEFT_A"]
    urls = {p["url"] for p in photos_for_sol(690, 10, fetch=fake_fetch)}
    assert not any("thumb" in u or "other_sol" in u for u in urls)  # thumbnail and other sol dropped
    assert len(urls) == 4  # the item with no image files is dropped


def test_missing_credit_gets_the_mission_credit():
    haz = [p for p in photos_for_sol(690, 10, fetch=fake_fetch) if p["camera"] == "FRONT_HAZCAM_LEFT_A"][0]
    assert haz["credit"] == "NASA/JPL-Caltech"


def test_no_images_for_sol_gives_empty_list():
    assert photos_for_sol(5, 3, fetch=fake_fetch) == []


def test_bad_response_and_bad_sol_raise():
    with pytest.raises(PhotosError):
        parse_raw_images({"nope": 1}, 690, 3)
    with pytest.raises(ValueError):
        photos_for_sol(-1, fetch=fake_fetch)
    with pytest.raises(ValueError):
        parse_raw_images(SAMPLE, 690, -1)


def test_fetch_failure_is_a_photos_error():
    def boom(url: str) -> dict:
        raise PhotosError("down")

    with pytest.raises(PhotosError):
        photos_for_sol(690, fetch=boom)


def test_query_url_names_the_sol():
    url = build_query_url(690)
    assert "mars2020" in url and "sol=690" in url
