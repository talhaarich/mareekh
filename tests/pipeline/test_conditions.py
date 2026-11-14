"""Tests for pipeline/conditions.py. CSVs are synthetic unless named real; column names match the real sol-100 PS and ATS files."""

import pytest

from pipeline.conditions import ConditionsError, conditions_from_meda

TAU_SRC = "test value"


def write_csv(path, header, rows):
    path.write_text(",".join(header) + "\n" + "\n".join(",".join(str(c) for c in r) for r in rows) + "\n")
    return str(path)


@pytest.fixture
def pressure_csv(tmp_path):
    rows = [(0, "t", "t", 700.0, 1, 3), (1, "t", "t", 710.0, 1, 3), (2, "t", "t", 720.0, 1, 3), (3, "t", "t", 999999999, 1, 3), (4, "t", "t", 9999999999, 1, 3)]
    return write_csv(tmp_path / "pressure.csv", ["SCLK", "LMST", "LTST", "PRESSURE", "PRESSURE_UNCERTAINTY", "TRANSDUCER"], rows)


@pytest.fixture
def ats_csv(tmp_path):
    rows = [(0, 200.0, 210.0, "", 999999999, 205.0), (1, 220.0, 230.0, "", 999999999, 225.0)]
    return write_csv(tmp_path / "ats.csv", ["SCLK", "ATS_LOCAL_TEMP1", "ATS_LOCAL_TEMP2", "ATS_LOCAL_TEMP3", "ATS_LOCAL_TEMP4", "ATS_LOCAL_TEMP5"], rows)


def test_returns_contract_fields_in_si_units(pressure_csv, ats_csv):
    out = conditions_from_meda(pressure_csv, 100, air_temp_csv_path=ats_csv, tau=0.6, tau_source=TAU_SRC)
    assert set(out) == {"sol", "tau", "air_temp_k", "pressure_pa", "source", "caveat"}
    assert out["sol"] == 100 and out["tau"] == 0.6
    assert out["pressure_pa"] == 710.0  # median; both invalid markers (9 and 10 nines) dropped
    assert out["air_temp_k"] == pytest.approx(215.0)  # median of 200, 205, 210, 220, 225, 230
    assert out["source"].endswith("sol 100. Tau: test value")
    assert "Sol 100 is used as a typical sol: the walk has no date." in out["caveat"]


def test_temperature_can_come_from_the_same_file(tmp_path):
    path = write_csv(tmp_path / "both.csv", ["PRESSURE", "ATS_LOCAL_TEMP1"], [(700, 200), (720, 210)])
    out = conditions_from_meda(path, 1, tau=0.5, tau_source=TAU_SRC)
    assert out["pressure_pa"] == 710 and out["air_temp_k"] == 205


def test_humidity_sensor_temperature_is_never_used(tmp_path, pressure_csv):
    hum = write_csv(tmp_path / "hum.csv", ["LOCAL_RELATIVE_HUMIDITY", "HUMIDITY_LOCAL_TEMP", "HUMICAP_TEMP"], [(5, 250.0, 251.0)])
    with pytest.raises(ConditionsError, match="humidity-sensor temperature is not used"):
        conditions_from_meda(pressure_csv, 1, air_temp_csv_path=hum, tau=0.5, tau_source=TAU_SRC)


def test_all_invalid_values_raise(tmp_path, ats_csv):
    path = write_csv(tmp_path / "p.csv", ["PRESSURE"], [(999999999,), (9999999999,), ("",)])
    with pytest.raises(ConditionsError, match="no valid PRESSURE"):
        conditions_from_meda(path, 1, air_temp_csv_path=ats_csv, tau=0.5, tau_source=TAU_SRC)


def test_out_of_range_values_raise(tmp_path, ats_csv, pressure_csv):
    mbar = write_csv(tmp_path / "mbar.csv", ["PRESSURE"], [(7.1,), (7.2,)])  # millibar by mistake
    with pytest.raises(ConditionsError, match="pressure .* outside"):
        conditions_from_meda(mbar, 1, air_temp_csv_path=ats_csv, tau=0.5, tau_source=TAU_SRC)
    hot = write_csv(tmp_path / "hot.csv", ["ATS_LOCAL_TEMP1"], [(500,)])
    with pytest.raises(ConditionsError, match="air temperature .* outside"):
        conditions_from_meda(pressure_csv, 1, air_temp_csv_path=hot, tau=0.5, tau_source=TAU_SRC)
    with pytest.raises(ConditionsError, match="tau .* outside"):
        conditions_from_meda(pressure_csv, 1, air_temp_csv_path=str(tmp_path / "hot.csv"), tau=50, tau_source=TAU_SRC)


def test_missing_tau_or_column_or_bad_sol_raise(tmp_path, pressure_csv, ats_csv):
    with pytest.raises(ConditionsError, match="tau"):
        conditions_from_meda(pressure_csv, 1, air_temp_csv_path=ats_csv, tau_source=TAU_SRC)
    with pytest.raises(ConditionsError, match="tau_source is empty"):
        conditions_from_meda(pressure_csv, 1, air_temp_csv_path=ats_csv, tau=0.5, tau_source="  ")
    nocol = write_csv(tmp_path / "x.csv", ["OTHER"], [(1,)])
    with pytest.raises(ConditionsError, match="column PRESSURE not found"):
        conditions_from_meda(nocol, 1, air_temp_csv_path=ats_csv, tau=0.5, tau_source=TAU_SRC)
    with pytest.raises(ConditionsError, match="sol"):
        conditions_from_meda(pressure_csv, -3, air_temp_csv_path=ats_csv, tau=0.5, tau_source=TAU_SRC)


REAL_PS_LINES = """SCLK,LMST,LTST,PRESSURE,PRESSURE_UNCERTAINTY,TRANSDUCER
675771621,00100M00:00:00.560,0099 23:56:47,761.55,,1
675771622,00100M00:00:01.533,0099 23:56:48,761.52,,1
675771623,00100M00:00:02.506,0099 23:56:49,761.55,,1
675771624,00100M00:00:03.480,0099 23:56:50,761.51,,1
675771625,00100M00:00:04.453,0099 23:56:51,761.53,,1
675771626,00100M00:00:05.426,0099 23:56:52,761.49,,1
675771627,00100M00:00:06.399,0099 23:56:53,761.53,,1
675771628,00100M00:00:07.373,0099 23:56:54,761.57,,1
675771629,00100M00:00:08.346,0099 23:56:55,761.55,,1
675771630,00100M00:00:09.319,0099 23:56:56,761.55,,1
675771631,00100M00:00:10.292,0099 23:56:57,761.53,,1
"""


REAL_ATS_LINES = """SCLK,LMST,LTST,ATS_LOCAL_TEMP1,ATS_LOCAL_TEMP2,ATS_LOCAL_TEMP3,ATS_LOCAL_TEMP4,ATS_LOCAL_TEMP5
675771620.5,00100M00:00:00.073,0099 23:56:47,202.98,203.22,203.44,207.77,203.27
675771621,00100M00:00:00.560,0099 23:56:47,203.04,203.41,203.56,207.72,203.27
675771621.5,00100M00:00:01.047,0099 23:56:48,203.08,203.38,203.59,207.76,203.29
675771622,00100M00:00:01.533,0099 23:56:48,203.03,203.34,203.51,207.78,203.25
675771622.5,00100M00:00:02.020,0099 23:56:49,203.15,203.36,203.61,207.78,203.19
"""


def test_real_sol_100_rows(tmp_path):
    """First real rows of WE__0100___________DER_PS and WE__0100___________CAL_ATS (PDS, sol 100)."""
    ps = tmp_path / "ps.csv"
    ps.write_text(REAL_PS_LINES)
    ats = tmp_path / "ats.csv"
    ats.write_text(REAL_ATS_LINES)
    out = conditions_from_meda(str(ps), 100, air_temp_csv_path=str(ats), tau=0.5, tau_source=TAU_SRC)
    assert out["pressure_pa"] == pytest.approx(761.53)
    assert out["air_temp_k"] == pytest.approx(203.36)  # median of the 25 ATS values


def test_file_for_another_sol_is_rejected(tmp_path, ats_csv):
    ps = tmp_path / "ps.csv"
    ps.write_text(REAL_PS_LINES)
    with pytest.raises(ConditionsError, match="is for sol 100, not sol 101"):
        conditions_from_meda(str(ps), 101, air_temp_csv_path=ats_csv, tau=0.5, tau_source=TAU_SRC)
