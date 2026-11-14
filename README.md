# Martian Map

A planning and rehearsal tool for one Mars walk (EVA) in Jezero Crater.
NASA Space Apps Challenge 2026, "Martian Map" challenge.

**Live link:** _added by Rafay once deployed_

## Start here

1. Read `CONTEXT.md`.
2. Read `docs/HOW_IT_WORKS.md`, then your own brief in `docs/briefs/`.
3. Give `CONTEXT.md` and your brief to your AI assistant at the start of every session.
4. Specs in `docs/specs/` change only by a pull request that edits the spec and tells the team.

## Layout

| Folder | Holds |
| --- | --- |
| `web/` | The app (React, Vite, Tailwind, MapLibre) |
| `web/public/data/jezero/` | Every file the app loads. Written by the pipeline. |
| `pipeline/` | Python steps that build those files |
| `docs/` | Specs, briefs, assumptions, data log, citations |
| `examples/` | Sample files that match the specs |

## Run

```bash
cd web && npm install && npm run dev
```

Pipeline: see `docs/briefs/murshad.md`.

## Team

Talha (engine, route planner) · Rafay (interface) · Sadia (data, science, submission) · Murshad (pipeline, deploy, video)

Data credits and sources: `docs/citations.md`.
