# Brief for Murshad: pipeline, deploy, video

Give this file and `CONTEXT.md` to your AI assistant at the start of every session.

You own the path from raw files to the files the app loads. Each step is a spec: one file, one main function, one test.

## Working remotely

Everything you make reaches the team as a pull request, so nobody ever needs your laptop.

- **Clone after Rafay posts the repo link**, around 09:15. Until then, set up conda and read the specs.
- **`make_fake.py` uses numpy only**, no GDAL, so anyone can re-run it if you drop off the call.
- **Commit the built files.** Pipeline output goes into `web/public/data/jezero/` by pull request.
  The app reads only those files, so nobody else has to run the pipeline. Keep each file under 20 MB.
- **Download raw files yourself** from the links Sadia posts and logs. Do not wait for a file transfer.
- **Do not wait for the final box.** Start clipping with the rough box in `examples/data/jezero/grid.json`
  (about 8 × 6 km around base). Re-run when Sadia posts the real corners.
- **Push work in progress to your branch every two hours.** Join every call on video.
- **Your smoke test counts for more because you are remote.** Open the live link from your own network
  on a laptop and a phone. That is the closest thing we have to a judge opening it cold.
- If you lose connection, post `BLOCKED` or `OFFLINE until <time>` in the chat as soon as you can.

## Read first
`CONTEXT.md`, then `docs/specs/CONTRACTS.md`, `docs/specs/CONVENTIONS.md`, `examples/data/tiny/README.md`.

## Your files
`environment.yml`, `pipeline/__main__.py`, `pipeline/make_fake.py`, `pipeline/steps/*.py`, `pipeline/tests/*`, and the built files in `web/public/data/jezero/`.

## Tasks, in order
1. `make_fake.py`, first hour after you clone, numpy only: `make_fake(out_dir: str, width: int = 400, height: int = 300, res_m: float = 20.0) -> None`.
   Writes `grid.json`, `dem.bin`, `slope.bin` for a made-up crater so the app is never blocked.
   Run it into `web/public/data/jezero/` and open the pull request straight away. Talha builds on it.
2. `environment.yml`: python 3.11, gdal, rasterio, pyproj, numpy, pyyaml, pillow, pytest.
3. `steps/clip.py`: `clip_dem(src_path: str, bounds: tuple[float, float, float, float], out_path: str) -> dict`.
   Keep the height file's own metric grid. Test: output pixel size is exactly 20 m.
4. `steps/derive.py`: `slope_deg(dem: np.ndarray, res_m: float) -> np.ndarray`, Horn method.
   Tests: flat gives 0; the tiny grid gives about 5.71 degrees away from the edges; real points within 0.5 degrees of `gdaldem slope`.
5. `steps/package_grids.py`: `package_grids(dem, slope, meta: dict, out_dir: str) -> None`.
   Test: write then read back gives equal arrays; north row first.
6. `steps/overlays.py`: `export_png(src_path: str, bounds: tuple, out_path: str, max_px: int = 4096, nearest: bool = False) -> list`.
   Returns the four corners for the manifest. `nearest=True` for class maps. Empty areas transparent.
7. `steps/write_manifest.py`: `write_manifest(config: dict, layer_results: list[dict], out_path: str) -> None`.
   Test: every layer has a credit and a caveat.
8. `python -m pipeline build pipeline/manifests/jezero.yaml` runs every step.
9. The live link deploys itself on every merge to `main` (Rafay sets it up). Before each checkpoint, open it
   from your own network on a laptop and a phone, and post `LIVE OK` or the exact console error.
10. Record the video against the live link. Sadia writes the script by Sunday 15:00. Record at 18:00 with
    Talha or Rafay on the call to drive or narrate if needed. Post the upload link by 19:30.

## Should
Height tiles for 3D. Hillshade and geologic overlays through the overlay step.

## Do not
Reproject the CTX height file. Hard-code a path inside a function. Compute slope from a picture.
