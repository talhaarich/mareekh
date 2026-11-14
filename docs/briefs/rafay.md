# Brief for Rafay: interface and look

Give this file and `CONTEXT.md` to your AI assistant at the start of every session.

You own everything the user sees and touches. Use the clickable prototype as the reference for layout and behaviour, not for code.

## Read first
`CONTEXT.md`, then `docs/specs/PLANNER_API.md` (the state table especially), `docs/specs/CONTRACTS.md` (manifest), `docs/specs/CONVENTIONS.md`.

## Your files
Repo config (`.github/`, `web/package.json`, `web/vite.config.ts`, `web/tsconfig*`) plus `web/src/components/*`, `web/src/map/*`, `web/src/styles/tokens.css`, `web/src/state/view.ts`, `web/src/state/pins.ts`.

## Tasks, in order
0. **Kickoff, 09:00 to about 10:30:** follow `docs/handoff/rafay-kickoff.md`. Create the repo, commit the kit,
   scaffold `web/`, put up the live link, protect `main`. Everyone waits on this, so it comes before anything else.
1. App shell (header, left panel, map, right panel) on top of the scaffold, deployed to the live link.
2. Design tokens in one file. Dark base, orange brand, cyan route. Red, amber, green only for warning, caution, normal.
3. Map view switch driven by `manifest.json`. A new layer in the manifest needs no code change.
4. Controls grouped by behaviour: reach is pick-one, data overlay is pick-one with a strength slider, wind and labels are checkboxes.
5. Labels with leader lines that avoid each other, markers and on-map controls.
6. Plan panel from `PlanResult`: status pill with reason, tiles, leg table, three sliders. Sliders update `params` on release.
7. Station cards with rover photos and credits.
8. Safety and honest-limits panels. Every number has a unit and a source or the word sample.
9. Drop pins and field notes, saved under `mm.pins.v1`.
10. EVA mode: one screen, large type, two large buttons.

## Should
Position beacon and edge arrow. Walk-home bar. Printable route card. Rock-unit overlay. Two crew markers. Zoom-to-3D with Talha.

## Do not
Compute distances, times or routes in components. Write to the `plan` or `position` slices.
