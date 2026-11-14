# Assumptions

Numbers about people and conditions. No terrain dataset contains them.
Values marked published came from the team's research notes and must be checked against the
original before they go on the project page. Values marked team are our own choices and are
labelled as assumptions on screen.

| Key | Value | Unit | Source | Kind |
| --- | --- | --- | --- | --- |
| `slope_limit_plan_deg` | 15 | deg | Published traverse-planning limit based on the Apollo life-support backpack | published |
| `slope_limit_hard_deg` | 20 | deg | CU Boulder NaviGATOR planner, citing NASA EVA concept of operations | published |
| `walk_speed_long_ms` | 0.75 | m/s | 2.7 km/h for walks over one hour, Apollo 15 walk-back modelling | published |
| `walk_speed_short_ms` | 1.0 | m/s | 3.6 km/h for short walks, same study | published |
| `speed_decay_per_grade` | 3.5 |  | Tobler's hiking function (Tobler 1993, NCGIA Technical Report 93-1). Shape only. | published |
| `speed_optimum_grade` | -0.05 |  | Same source: fastest on a 5% downhill. Grade is rise over run. | published |
| `work_rate_walk_kj_h` | 1030 | kJ/h | NASA standard, Apollo surface average | published |
| `work_rate_station_kj_h` | 600 | kJ/h | No source | team |
| `suited_mass_kg` | 200 | kg | Person plus suit, round figure | team |
| `mars_gravity_ms2` | 3.71 | m/s2 | Standard value | published |
| `walk_back_max_m` | 10000 | m | NASA Constellation planning | published |
| `dose_rate_msv_h` | 0.028 | mSv/h | Curiosity RAD at Gale crater, 0.64 mSv/day. A Gale measurement applied to Jezero. | published |
| `tau_normal` | 0.4 |  | Perseverance weather instrument, typical 0.3 to 0.5 | published |
| `tau_storm` | 1.0 |  | Perseverance, January 2022 storm | published |
| `station_dwell_s` | 1200 | s | No source | team |
| `eva_time_limit_s` | 21600 | s | No source found yet | team |
| `caution_spare_s` | 2700 | s | No source | team |
| `turnback_reserve_s` | 1800 | s | No source | team |
| `drift_fraction` | 0.05 |  | Position error growth per distance walked. Placeholder. | team |
| `mars_radius_m` | 3396190 | m | Standard Mars reference sphere | published |

The speed change with slope is a team model: Tobler's hiking-speed formula scaled so flat-ground speed
matches the values above: v = vmax · e^(−decay · (|grade − optimum| − |optimum|)), with decay =
`speed_decay_per_grade` and optimum = `speed_optimum_grade`. The planner uses `walk_speed_long_ms` as vmax. The Santee load-carriage model is the better replacement if time allows.
