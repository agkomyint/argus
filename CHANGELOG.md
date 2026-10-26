# Changelog

All notable changes to ARGUS. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). `bun run release` moves everything under
Unreleased into a dated section (see `docs/RELEASING.md`).

## [Unreleased]

## [0.1.0] - 2026-10-26

First public release. See `docs/version-map/0.1.0.md` for scope and exit criteria.

### Added
- Projects that turn connected sources into data products. Six products are supported: object detection
  dataset, density heatmap, vehicle traffic dashboard, road safety event feed, people count and apparent
  attribute breakdown. The other 26 in the catalog are listed as roadmap.
- Sources: file timelines with lanes (CSV, JSON and images through Meta vision), screen capture, Open-Meteo
  weather, a labelled simulated vibration sensor and a webhook (`POST /api/ingest/[sourceId]`). Every
  source writes Observations.
- Fusion and agents: asset alias matching, event-time correlation with weather, vibration and inspections,
  rule-based severity, Meta reasoning, and claim verification that rejects numbers not in the evidence.
- Postgres job queue (`FOR UPDATE SKIP LOCKED`) with per-source pause, resume and retry.
- Flows: an editable node graph (source, filter, sort, group, extract, classify, track, normalize,
  validate, fuse, layer, agent, factcheck, chart, publish) and drafting a flow from plain words.
- Engine map and replay, shared projects on `/explore`, REST API keys and an MCP server.
- Testing: `bun test` against PGlite with the real migrations, with a 95% line and function coverage gate.
- CI and release: GitHub Actions for lint, typecheck, tests and build on every push and pull request, and
  a tag-driven GitHub Release.

### Fixed
- Tests run through `bun run release` or `bun run check` picked up real keys from `.env.local`. The test preload now forces test values.
- CI typecheck failed on a fresh checkout: `PageProps`, `LayoutProps` and `RouteContext` were missing until `next typegen` ran.
- `/projects` no longer blocks instant navigation: its data loads inside a Suspense boundary.
- Dataset CSV export escaped each cell twice, so `crack, wide` came out as `"""crack, wide"""`.
- Flow fact-check marked a claim as verified when the number it got wrong was `0`.
