# ARGUS roadmap

ARGUS is a multimodal intelligence engine: it ingests data from different sources, relates observations to each other, and compiles them into reusable data products. Vision is the first source, not the only one.

**Hackathon goal:** ARGUS is a showcase of what Meta's AI models can do together. We run the analyses and visitors watch the replays. See `docs/HACKATHON.md`.

Related: `src/products/` (what we ship), `src/sources/` (what we ingest), `public/ARGUS_Visual_Data_Products_Whitepaper_v0.1.pdf` (contracts, ladder L0-L6).

## Status

Built so far (outside the phases below): Better Auth sign-in with demo users, project workspaces, S3 file uploads, data-product enablement per project, a Meta-model assistant with database tools, and a read-only admin console at `/dashboard/admin` (admins are listed in `ADMIN_EMAILS`; `bun run db:seed-admin` creates the account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`). 

**Phases 1–4 have a working vertical slice** (verified against the live Meta API): the `observations` / `assets` / `jobs` / `alerts` / `evidence` tables (Drizzle migrations), a Postgres job queue (`FOR UPDATE SKIP LOCKED`, no Redis), connectors for files (CSV/JSON/images via Meta vision), Open-Meteo weather, a labelled-simulated vibration sensor and a webhook (`POST /api/ingest/[sourceId]`, `x-ingest-key`), time/entity fusion in `src/lib/fusion.ts`, and an agent pipeline in `src/lib/agents/orchestrator.ts` (correlation → rule-based severity → Meta reasoning → claim verification → pending alert for human review). UI: Observations, Alerts, Sources and Overview ("Load sample bridge data"). Not built yet: real RTSP/camera, MQTT, database and API connectors, fuzzy entity matching, spatial joins, scheduled polling (jobs run on demand; a cron or QStash can call `/api/jobs/drain`).

## Principles

1. **One narrow story, built end to end, beats ten connectors.** The story is Bridge Intelligence: a camera flags a possible crack, ARGUS checks inspection history, vibration and weather, and emits an evidence-backed alert.
2. **Everything becomes an Observation.** Every connector, no matter the source, writes the same record (source, event time, arrival time, location, entity, payload, confidence, provenance). Fusion and products read only this table.
3. **Event time, not arrival time.** Store both. Joins use event-time windows.
4. **Boring infrastructure first.** Postgres (Supabase) as store and queue. No Kafka, Flink or vector DB until a measured problem demands it.
5. **Models propose, deterministic code computes.** LLM agents classify, explain and plan. Counts, joins and thresholds are plain code. Every conclusion keeps provenance.
6. **The manifest is the contract.** A new product or connector is a manifest plus a worker, nothing else.

## The fusion core (the actual product)

Connecting sources is easy. These five are the hard part, and are what we must be good at:

| Capability | MVP approach | Later |
| --- | --- | --- |
| Schema mapping | Per-connector mapper to `observation` | User-editable mapping UI |
| Entity matching | `asset` table with aliases (`Pier-A`, `Bridge Pier 01` -> one asset id); exact + alias lookup | Fuzzy and embedding match, human-confirmed |
| Time alignment | Event-time windows in SQL (`±N s` join), late data allowed within a grace period | Watermarks, stream processor |
| Spatial alignment | Asset has a point or polygon; observation inherits it via camera placement | PostGIS joins, projection from image to map |
| Provenance | `evidence` rows link every derived observation to its inputs and model version | Signed lineage, replay |

## Phases

### Phase 0: Foundations (done)
Bun + Next 16 + shadcn, Drizzle to Supabase connected, landing page, product manifest registry (30 products, 4 specified), demo workspace with simulated feed, sources catalog.

### Phase 1: The spine (first thing to build)
Goal: data goes in one end, a stored observation comes out, visible in the UI.

- Drizzle schema: `projects`, `sources`, `assets` (+ aliases), `observations`, `evidence`, `product_runs`.
- Source registry: `src/sources/` gains `connector` definitions (config schema in Zod, `ingest()` signature).
- Ingestion API route: `POST /api/ingest/[sourceId]`, validates, writes observation, returns id.
- Queue: a `jobs` table consumed with `SELECT ... FOR UPDATE SKIP LOCKED`. One worker loop.
- Run `db:push`.

Exit: a curl to the API shows up as a row and in the demo's observation stream.

### Phase 2: Four connectors
Pick the smallest set that proves multimodality. Order matters:

1. **File upload (CSV/JSON)**: inspection history and asset list. Easiest, gives us `assets`.
2. **Browser camera / video upload**: frames sampled, sent to one detector, written as detections. This is the only heavy one; start with a hosted model API and a frame every N seconds.
3. **REST API poller**: weather (rainfall, wind). Scheduled fetch, mapped to observations.
4. **MQTT (or simulated sensor)**: vibration. If broker setup is slow, ship a built-in simulator that emits the same messages, and keep MQTT real behind the same interface.

Exit: four source types visible in a Source Hub page, all writing to `observations`.

### Phase 3: Fusion
- Asset matching with alias table, shown in UI with unmatched observations queued for a human.
- Time-window correlation query: "for this camera event, give me sensors and weather within the window."
- Spatial link via asset location.
- Provenance: every correlated result stores its input observation ids.

Exit: given one camera detection, the system returns the related vibration, weather and inspection history, each traceable.

### Phase 4: Agents and the first fused product
- Agent roles, each a small function with a typed input/output: Perception (detect), Analysis (summarize window), Correlation (select related observations), Reasoning (draft explanation), Verification (check claims against stored numbers; reject unsupported ones).
- First fused product manifest: `bridge-monitoring-alert` (L3 to L5, `requiresHumanReview: true`). It reads `object-detection-dataset` plus sensor and weather observations.
- Output: an alert with evidence panel: frame crop, vibration chart, rain total, last inspection, confidence, limitations text.
- Human review queue: approve / dismiss.

Exit: the Bridge story runs live in the demo, not a mock.

### Phase 5: Workspace UX
- Project Workspace: create a project (bridge, road, factory).
- Source Hub: connect and monitor sources, health and last-seen.
- Data Fusion Canvas: visual matching rules. Build last, since the rules can start as config.
- Product Builder: choose a manifest, bind sources, publish dashboard / API / dataset.

### Phase 6: Scale and breadth (only when justified)
More connectors in demand order (databases, Kafka, webhooks, satellite/GIS), a real stream processor, auth and multi-tenant access, retention and privacy enforcement, export formats, the remaining roadmap products from the catalog.

## Cut list for a hackathon timeline

If time is short, ship Phases 1, 2 (items 1, 2, 3 with a simulated sensor), 3 (time-window + alias match), and 4 (one product, one alert). Defer the Canvas, agent studio UI, MQTT broker, auth, and every product beyond the Bridge alert. A working fused alert with visible provenance is worth more than a wide but hollow source list.

## Risks

- **Vision cost and latency.** Sample frames, cache, and keep a recorded clip as a fallback for demos.
- **Fusion looks like magic.** Show the join: which observations, which window, which rule. Trust comes from visible evidence.
- **Scope creep from the sources list.** Anything not in the current phase stays marked "Roadmap" on the landing page.
- **LLM-made numbers.** Verification agent must reject any figure not present in stored observations.

## Open questions

- Hackathon deadline and judging criteria (decides the cut list).
- Real bridge data available, or do we synthesize inspection history and vibration?
- Which detector: hosted API vs. local model.
- Auth needed for the demo, or single public project?
