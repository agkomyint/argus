# Configuring ARGUS

Source of truth: `src/lib/mcp/server.ts`, `src/lib/ops.ts`, `src/lib/lane-kinds.ts`, `src/lib/setup-rules.ts`, and `src/lib/lane-links.ts`. Recheck these when signatures or supported kinds change.

## Connection and ownership

Use the endpoint shown in Studio → **Agents**, at `<origin>/api/mcp`. It supports streamable HTTP, Better Auth OAuth (`argus:read`, with `argus:write` for mutation), and personal `argus_sk_…` bearer keys. Read-only OAuth grants omit write tools. Personal API keys grant owner-level write access; do not create/expose one merely to inspect a project.

The route is `src/app/api/mcp/route.ts`. Never print tokens, inspect browser cookies for reuse, or invent `/api/projects` endpoints. MCP calls use the authenticated owner. Browser uploads use the active workspace cookie: open the intended project through **Projects → Open in Studio** before uploading. Directly loading `/studio/<id>` renders that project's view but does not run the `openProject()` action that selects the workspace.

## Current MCP tools

These are server names; a connector may prefix them. Use its returned schema.

| Tool | Arguments and behavior |
| --- | --- |
| `list_products` | No arguments; supported catalog and suggested source needs |
| `list_projects` | No arguments; owned project ids and names |
| `get_project` | `{projectId}`; products, source keys/status, agents, tune, summary |
| `get_dataset` | `{projectId, productId, type?, limit?}`; limit 1–1000, default 100; default type is product's first Observation type |
| `create_project` | `{name, productIds}`; name 2–80 characters, at least one supported product; returns id |
| `set_products` | `{projectId, add?: string[], remove?: string[]}`; switches products and updates feed links |
| `add_source` | `{projectId, kind, name?, lat?, lng?, asset?, surge?, lanes?: [{name,note?}]}` |
| `configure_source` | `{projectId, sourceId, name?, lat?, lng?, asset?, surge?}`; weather/simulated sensor only; polls after saving |
| `set_tune` | `{projectId, level?, seconds?}`; Lean, Light, Balanced, Careful, Maximum; seconds 5, 10, 30, 60 |
| `pause_source` / `resume_source` | `{projectId, key}`; key from `get_project`, not an arbitrary lane UUID |
| `retry_source` | `{projectId, key}`; queues failed jobs for another attempt |

`add_source.kind` currently accepts only `files`, `screen`, `weather`, `sensor_sim`, `webhook`. `files` creates a timeline and optional **objects** lanes. It cannot set `analyzer`, create camera lanes, edit feeds, or upload files. Use Studio for those tasks, not unsupported MCP arguments. `get_project` aggregates sources; it is not a complete lane listing.

Example tool arguments (not REST requests):

```json
{"name":"Site diary","productIds":["object-detection-dataset","speech-log"]}
```

```json
{"projectId":"<returned-project-id>","add":["object-footprint"]}
```

For Site diary, create a Files/objects lane for photos and a Files/speech lane for spoken updates through Studio. Do not send the briefing to an objects lane.

## Lane recipes

Use `laneProblems()` and `laneFeeds()` in setup implementations; analyzer matching is not a visual convention.

| Input | Analyzer | Typical products | Behavior |
| --- | --- | --- | --- |
| `files` | `objects` | `object-detection-dataset`, `object-footprint`, `density-heatmap`, `people-count` | Images and browser-sampled video; counts/masks depend on enabled products |
| `files` | `speech` | `speech-log` | Audio or audio extracted from browser-decodable video |
| `files` | `body` | `body-progress`, `body-compare`, `checkin-streak` | Daily photos, preserve `takenOn`; photos excluded from public media |
| `files` | `screen` | `persona-perception-map`, `persona-agreement`, `friction-log` | Screenshot reviews by simulated personas, distinct from live screen capture |
| `camera` | `objects` | Compatible vision products | One upload/session, no source row; 60 seconds, 5-second samples, no microphone |
| `screen` | `objects` | `people-count`, `attribute-breakdown` | Browser screen-capture path, not camera recording |
| `weather` | `objects` | Inspect `sourcesFor()`/`laneFeeds()` | Weather Observations; latitude and longitude required |
| `sensor_sim` | `objects` | Inspect current rules | Simulated readings, not hardware; asset name required |
| `webhook` | `objects` | Inspect current rules | JSON becomes Observations; an arbitrary type is not automatically a compatible feed |

Weather, sensors, and webhooks can store rows even when no current Studio product reads their lane. Do not equate a connected source with a useful product. Source-need hints are coarser than analyzer compatibility.

`setLaneFeeds()` keeps only enabled, compatible products. Creation defaults to all compatible enabled products. A product without links can fall back to project-wide reads; removing every link is not a reliable "show no data" switch. Legacy rows without a lane may also be included. See `src/lib/product-data.ts`.

## Media and processing

- `POST /api/uploads`: session-owned workspace, `{filename,contentType,size,laneId,takenOn?}` → record and short-lived signed PUT URL; maximum 500 MiB. Registration does not upload bytes.
- PUT bytes to the returned storage URL with matching Content-Type, then `POST /api/uploads/<id>/complete`. Completion verifies storage, marks ready and queues processing. Do not log signed URLs.
- Video still needs browser sampling: JPEG POSTs to `/api/uploads/<id>/frames` with `x-at-ms`, then a JSON sampling report. Ordinary completion does not decode video server-side. At most 60 frames, normally every 2 seconds, farther apart for long clips.
- Speech uploads are canonical mono 16-bit 16 kHz WAV, maximum 9 minutes. The browser normalizes them. A WAV extension is insufficient: extra header chunks can fail `wavDuration()`. Use browser conversion or `wavOf()`, not a renamed MP3 or arbitrary OS-generated WAV.
- Screen/camera need a supported browser and explicit capture start. Keep camera controls mounted until saving finishes; retry/download is available on failure.
- `POST /api/ingest/<sourceId>` uses `x-ingest-key` and accepts one record or up to 500: `{type,eventTime?,asset?,confidence?,payload?}`. Use authorized data. Do not fabricate model outputs or label simulated readings as hardware measurements.
- Enqueueing uses Next `after()` to drain jobs. `POST /api/jobs/drain` requires a signed-in workspace or `JOBS_DRAIN_SECRET` and drains a shared queue. Use only when relevant to the task, not as a read/status endpoint.

MCP `get_dataset()` currently calls project/type-wide `loadDatasets()`, not the lane-filtered `loadProductData()` used by Studio. It can inspect rows but does not prove a filtered widget total. Tune cost/accuracy figures are estimates, not measured billing or accuracy. Camera intervals and uploaded-video sampling are independent of `set_tune.seconds`.

## Completion and recovery

Re-read state after changes. Do not repeat creation/upload because a response was slow: inspect first to avoid duplicates. If a job fails, inspect Observatory and fix the cause before retrying; retries may cost another model call. Report persistent blockers instead of repeatedly paying for the same failure.

Enabling `object-footprint` or another mask consumer through `ops.setProducts()` calls `queuePastPictures()`. Expect queued SAM work and verify traces. Products reading existing Observations usually need no reanalysis. Public replay readers must never trigger backfill.
