# Posts for the team chat

## For Murshad: files he downloads himself (task 3)
Do not send him any file. Post the exact links (all from `data/README.md`); each is already logged in `docs/data-log.md`.

> **Data links for Murshad (download yourself)**
> - Height, CTX 20 m (90 MB): https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif
> - Photo, CTX 5 m (360 MB): https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif
> - Minerals (small), colour key in the readme: https://zenodo.org/records/5575824
> - MOLA 463 m global (clip to the box): https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif
> - THEMIS 100 m (note lon_0 = 180, reproject first): https://astrogeology.usgs.gov/search/map/mars_themis_day_ir_controlled_mosaic_syrtis_major_00n_45e_100_mpp
> - Weather CSVs, sols 100-102: https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0090_0179/

## Box corners (task 4)
> Box `[south, west, north, east]`: `[17.95, 77.10, 18.85, 78.00]`. Base: 18.4446 N, 77.4509 E. The CTX height file covers the whole box. Station margin (500 m) not checked yet: I am waiting for the rover waypoint file.

## BLOCKED posts to send now
- `BLOCKED: rover waypoint and traverse files are not in data/raw/. Need https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json (or the download on the NASA location map page). stations.py is ready and waits for it.`
- `BLOCKED: docs/assumptions.md was not in the files I was given. Needed for assumptions.json (task 7) and the station dwell times (dwell_s).`
- `BLOCKED: conditions.json needs air temperature, but none of the MEDA derived files (PS, RHS, TIRS, WS) has it. Need the calibrated ATS file for the chosen sol (data_calibrated_env). Also need a sourced dust optical depth (tau); it is not in any MEDA CSV. Which sol does the app use: 100, 101 or 102?`
- `BLOCKED: photos.py: NASA's Mars Rover Photos API is retired (Oct 2025); I used the mars.nasa.gov raw-images feed but could not call it. Someone with open internet: save one real response for sol 690 as tests/pipeline/data/raw_images_sol690.json.`
- `QUESTION for Talha/Rafay: stations.py returns (lat, lon) as a tuple, as the brief says, but CONVENTIONS says never a bare pair. OK to keep the tuple inside the pipeline only?`
