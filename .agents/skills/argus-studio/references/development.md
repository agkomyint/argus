# Extending and debugging ARGUS

Read repository `AGENTS.md` before changes. Its component-first and tracing requirements apply. Current code wins over old README/dashboard terminology and this skill if they disagree. Before Next.js code, read the relevant installed guides under `node_modules/next/dist/docs/`.

## Code map

| Concern | Files |
| --- | --- |
| Product contracts/catalog | `src/products/schema.ts`, `define.ts`, `index.ts`, `manifests/` |
| Widget contracts/registration/defaults | `src/widgets/schema.ts`, `manifest.ts`, `registry.tsx`, `resolve.ts`, `library/` |
| Selectable products/source hints | `src/lib/pickable.ts`, `src/lib/product-sources.ts` |
| Inputs/analyzers/feed validation | `src/lib/lane-kinds.ts`, `setup-rules.ts`, `lane-links.ts` |
| Owner project operations/MCP | `src/lib/ops.ts`, `src/lib/mcp/server.ts`, `src/app/api/mcp/route.ts` |
| Session and active workspace | `src/lib/session.ts`, `src/lib/project-cookie.ts`, `openProject()` in `src/app/actions.ts` |
| UI mutations | `src/app/lane-actions.ts`, `product-actions.ts`, `pipeline-actions.ts`, `actions.ts` |
| Studio/windows | `src/app/(studio)/studio/[id]/page.tsx`, `src/components/studio/owner-bar.tsx`, `studio-window.tsx`, `lane-board.tsx`, `lane-manager.tsx`, `product-manager.tsx` |
| Upload UI/browser pipeline | `src/components/workspace/lane-upload.ts`, `upload-panel.tsx`, `src/components/studio/lane-drop.tsx` |
| Camera and video | `src/components/studio/camera-lane.tsx`, `src/sources/browser-video.ts`, `video-plan.ts`, `video.ts` |
| Speech | `src/sources/browser-audio.ts`, `audio-plan.ts`, `audio.ts`, `src/widgets/library/speech-log.tsx` |
| Other Observation writers | `src/lib/connectors.ts`, `capture.ts`, `perception.ts`, `sam.ts`, `body-check.ts`, `persona-review.ts` |
| Records and fusion | `src/db/schema.ts`, `src/lib/observations.ts`, `src/lib/fusion.ts` |
| Background jobs | `src/lib/jobs.ts`, `job-handlers.ts`, `src/app/api/jobs/drain/route.ts` |
| Trace and model contracts | `src/lib/trace.ts`, `traces.ts`, `models.ts`, `src/components/studio/observatory.tsx` |
| Lane-filtered product reads | `src/lib/product-data.ts`, `src/lib/project-reads.ts` |
| Timeline and public replay | `src/lib/studio-timeline.ts`, `replay.ts`, `explore.ts`, `share-types.ts`, `src/components/explore/public-studio.tsx` |
| Preview and tests | `src/app/design/page.tsx`, `tests/catalog.test.ts`, `tests/lib/`, `docs/TESTING.md` |

## Configuring versus building

"Add Speech log to my project" is configuration: use MCP `set_products` or Studio Products, not source edits. "Create a speaker airtime product" is implementation: check whether existing `transcript_turn` rows already contain everything needed. "Connect my webcam" is existing camera-lane configuration, not RTSP support. Clarify only when that distinction changes the requested outcome.

State the new capability in plain words and show how it turns sources into data products. Match existing conventions rather than building another registry or parallel observation format.

## New product from existing Observations

1. Inspect the actual payload, timestamps, provenance and producer—not just a manifest schema. Choose the Observation types and computation. Counts, durations and joins belong in deterministic code; do not ask a model to calculate them. Reuse shared calculation helpers if multiple consumers need the result.
2. Write a `ProductManifestInput` in `src/products/manifests/` and register it in `src/products/index.ts`. Use a unique stable id and catalog number. Declare observationTypes, schema, upstream inputs, limitations, privacy and outputs honestly. Upstream `inputs` are dependency declarations, not automatic computation pipelines; Studio loads the declared Observation types.
3. Reuse a widget if appropriate. Otherwise build in `src/widgets/library/`, register its component/manifest/deterministic samples in `src/widgets/registry.tsx`, and preview compact/full/empty variants in `/design` inside Group + Surface before exposing new UI. Keep existing entries in order: WID codes derive from array indices. Choose an unused Surface code.
4. Set the product's `widget` id/bind/settings. Widgets receive rows flattened by `src/widgets/resolve.ts`: payload fields plus `t`, `type`, optional confidence. Observation ids are not automatically part of every FlatRow. Do not assume project identity or signed media URLs are present unless explicitly passed.
5. Update compatibility/source hints only as needed: `WRITES`, `analyzerFor`, `laneFeeds`, `sourcesFor`. The current `analyzerFor()` selects one matching analyzer; simply declaring speech and vision types does not create cross-analyzer feeds or fusion. Design and test multi-source compatibility explicitly.
6. Enable in the intended project through the normal owner operation after implementation/preview. Verify saved feeds, real data, Observatory, owner Studio and public replay if in scope. Adding a manifest does not enable it in all projects.

No new model call is necessary when stored rows suffice. If existing rows lack the evidence, implement a producer/backfill explicitly rather than showing sample data as real results. SAM backfill is an existing special case.

## New source, analyzer, or model step

Implement the connector under `src/sources/` with typed input/output and Observation writes. New reasoning stages belong in `src/lib/agents/orchestrator.ts`; fusion belongs in `src/lib/fusion.ts`. Register jobs/handlers when background work is needed.

Update all actual boundaries for new lane kinds: enums in `lane-kinds.ts`, setup validation/labels/WRITES, create/link logic, icons/accept rules in `lane-drop.tsx`, lane editor/setup and manager, upload dispatch/server validation where relevant. Update MCP schemas only if that surface is intentionally being extended; an enum added to Studio does not automatically add it to `ops.SOURCE_KINDS`.

Use `withTrace({projectId,userId,uploadId})` at the entry point, `traced({kind,name,model?,input,output,usage,observations}, fn)` around work, and `writeTrace()` for externally measured/browser work. Use dotted names and returned Observation ids. Bytes become sizes through `small()`; never record secrets/full files. Preserve error traces and non-fatal trace-write behavior. Do not invent confidence or token usage when an API omits it.

Prefer request/job entry points over one-off direct database scripts. Helpers such as `createLane()` do not themselves authenticate an owner; actions/ops perform that check. `enqueue()`/resume/retry can use Next `after()` and require request context. Server-only module loading in a Bun maintenance script is not a replacement for that lifecycle. Read existing scripts before choosing a maintenance approach; use one only for an explicitly relevant task, preserve traces, and inspect current records before retrying mutations.

## Diagnose missing results

Check in this order, stopping when the cause is established:

1. Correct browser account, target project, and active workspace? A direct Studio URL and active cookie can differ.
2. Product enabled, correct lane input/analyzer, feed chips saved? Generic MCP files lanes always use objects.
3. Upload ready, correct date, actual S3 bytes present? For video, did sampling finish? For speech, did canonical normalization finish? Storage success alone is not model success.
4. Queue running, paused or failed? Inspect source key (`tl:…`, `src:…`, `screen`, `files`), job result, Observatory error, written ids. Retry only after addressing the cause.
5. Correct Observation type/payload and lane-filtered dataset? `ops.getDataset()` currently reads project-wide type rows; widget totals can differ.
6. Playhead at end? Older selected files hide newer data. Restore minimized panels and inspect the scrollable product dock.
7. Public sharing/media permission and body-photo exclusion? Different behavior between owner and public can be intentional. Preserve the no-model-call replay boundary.

## Verification

Use `docs/TESTING.md` and `package.json`. Bun tests preload PGlite with real migrations, fake storage/model calls and collected `after()` callbacks. Add behavior tests for new calculations, contracts, producer failures, provenance, feed restrictions and zero-call replay where affected.

Run focused tests first, then the required `bun run check` (lint + typecheck + coverage) for substantive implementation changes. The coverage gate is 95% lines/functions per measured file. UI is verified in `/design`; browser-specific decoding/capture needs appropriate browser checks. Do not assert real-hardware or live-API verification based only on mocked tests. Documentation-only work needs skill/link/helper validation, not paid model calls or a full app build.

Relevant existing tests include `tests/lib/lanes.test.ts`, `setup.test.ts`, `audio.test.ts`, `video.test.ts`, `studio-timeline.test.ts`, and `tests/catalog.test.ts`. Historical migration-pair tests exclude products added after that migration; do not edit old migration SQL to include a new catalog entry.
