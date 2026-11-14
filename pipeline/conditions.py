"""Surface conditions for one sol from MEDA CSV files (-> conditions.json).

Units out: air temperature in kelvin, pressure in pascals, tau unitless
(CONVENTIONS.md).

Checked against real files: the derived pressure file (``WE__0100___DER_PS``) has the header
``SCLK,LMST,LTST,PRESSURE,PRESSURE_UNCERTAINTY,TRANSDUCER`` and ``PRESSURE`` is in pascals.
NOT yet checked against a real file: the calibrated ATS file, whose columns
``ATS_LOCAL_TEMP1`` .. ``ATS_LOCAL_TEMP5`` (K) come from a summary of the MEDA RDR SIS.
None of the derived files (PS, RHS, TIRS, WS) holds air temperature, so an ATS file is needed.
The sol is checked against the first LMST value of each file (``00100M...`` means sol 100).

Three deliberate choices:
* Invalid values: the SIS says ``999999999`` and the PDS readme says ``9999999999``.
  Any value of 999999999 or more is dropped, so both spellings are covered.
* Air temperature never comes from the humidity sensor (``HUMIDITY_LOCAL_TEMP``,
  ``HUMICAP_TEMP``). Those columns are not read at all.
* Tau is not a MEDA CSV column, so it must be passed in with a source.
"""

from __future__ import annotations

import csv
import math
import statistics
from pathlib import Path

PRESSURE_COLUMN = "PRESSURE"
AIR_TEMP_COLUMNS = tuple(f"ATS_LOCAL_TEMP{i}" for i in range(1, 6))
INVALID_FROM = 999999999.0  # values at or above this mean "could not be computed"

# Plausibility limits (team assumptions; move to assumptions.json if the team wants them tracked).
PRESSURE_RANGE_PA = (100.0, 1500.0)
AIR_TEMP_RANGE_K = (120.0, 330.0)
TAU_RANGE = (0.0, 10.0)


class ConditionsError(ValueError):
    """Raised for a missing column, no valid data, or a value outside its sane range."""


def _valid_values(csv_path: str | Path, columns: tuple[str, ...]) -> tuple[list[float], list[str]]:
    """Return (valid numbers from the named columns, which of those columns exist)."""
    values: list[float] = []
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        present = [c for c in columns if c in [h.strip() for h in (reader.fieldnames or [])]]
        if not present:
            return [], []
        for row in reader:
            clean = {k.strip(): v for k, v in row.items() if k}
            for column in present:
                raw = (clean.get(column) or "").strip()
                if not raw:
                    continue
                try:
                    number = float(raw)
                except ValueError:
                    continue
                if math.isfinite(number) and number < INVALID_FROM:
                    values.append(number)
    return values, present


def _first_lmst_sol(csv_path: str | Path) -> int | None:
    """Sol number from the first LMST value (e.g. ``00100M00:00:00.560`` -> 100), or None if absent."""
    with open(csv_path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            lmst = ((row.get("LMST") or "") if row else "").strip()
            head = lmst.split("M")[0]
            return int(head) if head.isdigit() else None
    return None


def _check_file_sol(csv_path: str | Path, sol: int) -> None:
    file_sol = _first_lmst_sol(csv_path)
    if file_sol is not None and file_sol != sol:
        raise ConditionsError(f"{csv_path} is for sol {file_sol}, not sol {sol}")


def _check_range(name: str, value: float, low_high: tuple[float, float], unit: str) -> float:
    low, high = low_high
    if not (low <= value <= high):
        raise ConditionsError(f"{name} {value:.3f} {unit} is outside the sane range {low} to {high} {unit}")
    return value


def conditions_from_meda(
    csv_path: str,
    sol: int,
    *,
    air_temp_csv_path: str | None = None,
    tau: float | None = None,
) -> dict:
    """Return ``{sol, tau, air_temp_k, pressure_pa, source, caveat}`` for ``sol``.

    ``csv_path`` is the MEDA derived pressure file for the sol (column PRESSURE, Pa).
    ``air_temp_csv_path`` is the MEDA calibrated ATS file for the same sol; if it is
    None, ``csv_path`` itself must hold the ATS columns. Pressure and temperature are
    the medians of the valid readings in the files. MEDA only measures about 12 hours
    per sol, so these are medians over the measured hours, not a full-day mean.
    ``tau`` (dust optical depth, unitless) is not in the MEDA CSVs; pass a sourced value.

    Raises:
        ConditionsError: no tau, missing columns, no valid readings, or a value
            outside its sane range (pressure 100 to 1500 Pa, air 120 to 330 K, tau 0 to 10).
    """
    if isinstance(sol, bool) or not isinstance(sol, int) or sol < 0:
        raise ConditionsError(f"sol must be a non-negative integer, got {sol!r}")
    if tau is None:
        raise ConditionsError("tau is not a MEDA CSV column; pass tau=<value> from a sourced dust-opacity product")
    tau = _check_range("tau", float(tau), TAU_RANGE, "")
    _check_file_sol(csv_path, sol)  # derived/calibrated MEDA files hold one sol; LMST starts with it
    if air_temp_csv_path:
        _check_file_sol(air_temp_csv_path, sol)

    pressures, present_p = _valid_values(csv_path, (PRESSURE_COLUMN,))
    if not present_p:
        raise ConditionsError(f"column {PRESSURE_COLUMN} not found in {csv_path}")
    if not pressures:
        raise ConditionsError(f"no valid {PRESSURE_COLUMN} readings in {csv_path}")
    pressure_pa = _check_range("pressure", statistics.median(pressures), PRESSURE_RANGE_PA, "Pa")

    temp_path = air_temp_csv_path or csv_path
    temps, present_t = _valid_values(temp_path, AIR_TEMP_COLUMNS)
    if not present_t:
        raise ConditionsError(f"no ATS_LOCAL_TEMP columns in {temp_path} (humidity-sensor temperature is not used)")
    if not temps:
        raise ConditionsError(f"no valid ATS_LOCAL_TEMP readings in {temp_path}")
    air_temp_k = _check_range("air temperature", statistics.median(temps), AIR_TEMP_RANGE_K, "K")

    return {
        "sol": sol,
        "tau": tau,
        "air_temp_k": air_temp_k,
        "pressure_pa": pressure_pa,
        "source": f"NASA PDS Atmospheres Node, Mars 2020 MEDA (derived pressure, calibrated ATS), sol {sol}",
        "caveat": "Median over the hours MEDA measured on this sol (about 12 of 24); not a full-day average. Tau supplied separately.",
    }
