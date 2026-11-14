# Project page text (task 9): DRAFT for Sunday midday

Items in [BRACKETS] are not known to me and must be filled by the team. Do not describe a feature here until it works in the live link.

**Project Name:** Martian Map [add tagline]

**High-Level Project Summary**
Martian Map is a planning and rehearsal tool for one Mars walk (EVA) in Jezero Crater. A crew member opens a map, sees the stations of the walk, gets a route that avoids steep ground, and is told whether the walk fits the time limit and where to turn back. It uses real orbital terrain data and the real positions and photos of NASA's Perseverance rover. It is for planning in the habitat, not for use during a mission. [Challenge selected: NAME OF THE OFFICIAL NASA CHALLENGE]

**Detailed Project Description**
The walk: two astronauts leave base, collect the sample tubes Perseverance left at the Three Forks depot, sample the delta at its base and at its top, and walk home. The map shows four views (satellite, relief, topo, elevation). Slope comes only from the height data. A route finder avoids ground above a slope limit set by the user and reports distance, time, energy, radiation dose and a turn-back point. [Only keep the features that are live at submission.] Tools: React, Vite, Tailwind, MapLibre GL JS, Zustand; a Python data pipeline (GDAL, rasterio, pyproj, numpy). Station positions come from where Perseverance actually stood on given sols, so every station is a place a robot has already been.

**NASA Data**
- Perseverance rover waypoints and traverse (NASA/JPL, Mars 2020 location map): station positions.
- Mars 2020 raw images (NASA/JPL-Caltech and instrument teams): photos at each station, credited on screen.
- MEDA weather data (NASA PDS Atmospheres Node): pressure and air temperature for the conditions panel.
- MRO CTX height model (20 m) and orthophoto mosaic (5 m) of Jezero crater (NASA/JPL/MSSS; mosaics by USGS Astrogeology): terrain, slope and the satellite view.
- MGS MOLA height mosaic (NASA/GSFC) and Mars Odyssey THEMIS day infrared mosaic (NASA/ASU): [keep only if used in the app].

**Space Agency Partner & Other Data**
- CRISM-based mineral map (Parente et al. 2021, CC BY 4.0). It covers only the landing area, not the whole map.
- USGS geologic map of Jezero crater and Nili Planum (Sun and Stack 2020): [only if the overlay is built; not downloaded yet].
- Full list with links: docs/citations.md. [Add every library and image used by the app.]

**Use of Artificial Intelligence**
[Team to confirm the exact tools.] AI coding assistants were used to write and review code and documents in this repository. Where code or data was AI-assisted this is stated in the repository and in file notes. No AI-generated images or video are used [confirm]. No NASA logos or mission identifiers appear in AI-generated content.

## Why each station matters (one paragraph each)
**S1, Three Forks depot.** In early 2023 Perseverance set down 10 sample tubes here, 5 to 15 m apart, as the first sample depot on another world and a backup for bringing Mars samples to Earth. The crew's first job is to find and collect them, which makes this the walk's logistics test: flat ground, many small stops, precise positions.

**S2, Delta base.** The delta is why Perseverance was sent to Jezero. NASA's project scientist said the rocks from the base of the delta up to the Rocky Top level appear to have formed in a lake. Samples here test whether the lake could have held life and what the water was like.

**S3, Delta top.** The upper delta holds flat-lying beds that researchers read as river deposits laid down on top of the delta front. They carry material from far upstream that the rover will never reach, so sampling here reads the story of the whole river system. From the depot to S3 is a climb of about 23 m, by the rover's own waypoint heights. [Station sols for S2 and S3 still to confirm.]
