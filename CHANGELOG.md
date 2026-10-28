# Changelog

All notable changes to ARGUS. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). `bun run release` moves everything under
Unreleased into a dated section (see `docs/RELEASING.md`).

## [Unreleased]

## [0.2.0] - 2026-10-28

ARGUS Studio. See `docs/version-map/0.2.0.md` for scope.

### Added
- ARGUS Studio at `/studio/[id]`, one per project: lanes on the left, preview in the middle, data products
  on the right, and a playable timeline at the bottom. Setup opens as windows inside the Studio.
- Lanes come first. Every file, video, feed and sensor goes in through a lane, the AI suggests lanes for
  the chosen products, and files are dropped straight onto a lane.
- Video without ffmpeg: frames are sampled in the browser and read by Meta vision.
- SAM 3.1 locates the objects Muse Spark names and writes `object_mask` Observations with real outlines,
  shown over the preview. New Object footprint product, and Density heatmap now uses real positions.
- A model registry that says which Meta model does which job.
- The Observatory: every model call, code step and tool call is traced and shown in the Studio and on
  the timeline (Simple, Lane steps and Everything modes).
- Persona perception and a private body log product.
- Ask ARGUS: one chat across projects with `@project` mentions.
- `/explore` replays a shared project as a read-only Studio with no model calls. Media shows only when the
  owner opts in, and body photos never do.
- `/docs` with a guide, FAQ and screenshots, and a new landing page.

### Changed
- `/projects` is for reading data products, full screen. Adding sources moved into the Studio.

### Removed
- The old `/dashboard` and its pages. Their tools (agents, products, sources) live in Studio windows.

### Fixed
- The timeline flickered and sometimes drew two lines. Lane and product panels reloaded instead of
  appending new rows.
- The timeline ran on to the current time after a project's data ended.
- Turning a product on queued every past picture with its own job drain, which could exhaust the
  database's connections. It now queues once, skips pictures already queued, and SAM calls time out
  after 60 seconds.

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
