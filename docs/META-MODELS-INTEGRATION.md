# Meta models: research and ARGUS integration plan

Research date: 2026-10-28. Status: proposal; no runtime integration implemented by this document.

## Capability and project fit

**An author describes the data product they want, adds source data, and ARGUS selects compatible Meta capabilities, runs a validated analysis, and records an evidence-backed replay.**

This fits ARGUS: sources become Observations, fusion relates them, manifests define products, and widgets display the results. For the hackathon, authors run the analyses in Studio; visitors watch stored results on `/explore` without sign-up or new model calls. See [HACKATHON.md](HACKATHON.md) and [ROADMAP.md](ROADMAP.md).

Recommendation: first integrate the hosted Meta Model API families through separate adapters. Start with Spark + SAM + transcription in one recorded story. Add image generation only to a product where an explicitly generated illustration helps explain the data. Keep a place for research models without making GPU hosting a prerequisite.

## Research scope and evidence

The requested starting point was the [Meta developer overview with the supplied team/project context](https://dev.meta.ai/docs/overview?team_id=1312144450995364&project_id=840255142389498). That exact URL could not be fetched by the research reader. The public [overview](https://dev.meta.ai/docs/overview) and its model-specific developer guides were readable and form the primary basis of this plan.

Documentation availability is not proof that our project's API key can call every model. No authenticated inference, billing check, package installation, or GPU deployment was performed. Account access and actual response shapes remain implementation spikes.

Sections below separate documented Meta behavior from proposed ARGUS design. Proposed capability IDs, files, Observation types, and database additions do not exist merely because they appear here.

## 1. What Meta offers

### Hosted models relevant to ARGUS

| Model ID | Documented role | Proposed ARGUS use |
| --- | --- | --- |
| `muse-spark-1.3` | Multimodal understanding, reasoning, structured output, tool calling | Default planner, source interpretation, image review, evidence-based explanations |
| `muse-wonder-1.0` | More complex, longer agentic work | Optional difficult planning/reasoning step after evaluation |
| `sam-3.1` | Image/video segmentation and tracking | Object masks, cut-outs, per-frame instance records and local tracks |
| `muse-voice-transcribe-1.0` | Speech transcription | Time-aligned transcript turns and anonymous speaker labels |
| `muse-image-1.0` | Image generation and editing | Clearly labelled illustrative output attached to a data product |

Meta also documents earlier Spark versions. Wonder Full is a Muse Code offering, not a callable Model API model. These distinctions matter when registering executable models. Source: [Meta model catalog](https://dev.meta.ai/docs/models).

The hosted families share the `https://api.meta.ai/v1` base URL. Meta examples name the credential `MODEL_API_KEY`; ARGUS currently reads `META_API_KEY`. Keep our existing environment variable and map it inside the client rather than requiring two secrets. Source: [Meta API overview](https://dev.meta.ai/docs/overview).

### SAM: geometry rather than a scene description

SAM 3.1 accepts an image or video and a concrete concept prompt, or box/point prompts. It returns boxes and masks. A useful division is Spark interpreting the scene and proposing a target such as “delivery van,” then SAM locating its pixels. Source: [Media segmentation](https://dev.meta.ai/docs/media-segmentation).

Use a Responses adapter, not the existing chat completion wrapper. The documented `sam-3.1` endpoint is `POST /v1/responses`. Meta also documents `@meta-sam/parser` for parsing its special-token output and decoding masks. Verify package availability and pin a tested version during implementation. Source: [SAM overview](https://dev.meta.ai/docs/sam/overview).

Integration details that affect correctness:

- Output is special-token text, not ordinary JSON labels. Mask payloads use base85 encoding.
- Read explicit frame indices; frames may be omitted or returned out of order.
- Object IDs are sparse and scoped to a response. Preserve them rather than using array positions.
- Do not assume identity survives an exit, full occlusion, long clip, separate request, or shot cut.
- An empty result can mean a successful run with no matches.
- Confidence is optional; absence must remain `null` rather than becoming a made-up score.

Source: [Reading segmentation output](https://dev.meta.ai/docs/sam/reading-segmentation).

ARGUS should compute mask area, accepted instance counts, occupancy, and sampled track durations in code. These remain measurements of model predictions, not guaranteed real-world ground truth. Pixel area does not become square metres without calibration. Per-frame counts do not become a count of unique people across a whole video.

### Audio: understanding, transcription, and separation are different

**Understanding:** Spark can process video with its embedded audio, and can return text about audio/video. This can support structured event proposals and summaries. Source: [Video and audio understanding](https://dev.meta.ai/docs/video-understanding).

**Transcription:** Muse Voice Transcribe provides a file endpoint (`POST /v1/asr/transcribe`) and a live WebSocket endpoint (`wss://api.meta.ai/v1/asr/realtime`). It supports speech turns and speaker labels, with turn-level timing. It does not supply word timestamps, confidence scores, sound-event detection, emotion detection, or speech synthesis. Realtime authentication is in the handshake; file requests use the authorization header. Source: [Speech to text](https://dev.meta.ai/docs/speech-to-text).

Proposed first integration: uploaded audio or extracted video audio through the file endpoint. Store completed turns. Add live capture later through a server-side relay so the browser never receives the permanent provider key. A speaker label such as A or B is local to that recording, not a person's identity.

**Separation:** SAM Audio isolates target sound from a mixture using text, visual, or time-span prompts. This is a different capability from transcription. Meta's research release provides checkpoints and inference code; it is not listed as a hosted model in the developer catalog reviewed here. Do not invent a `sam-audio` Model API ID or route it through the transcription endpoint. Sources: [Meta SAM Audio](https://ai.meta.com/samaudio/), [Meta's official SAM Audio repository](https://github.com/facebookresearch/sam-audio).

Proposed optional adapter: a separately deployed Python/GPU service producing target and residual audio artifacts. Register it only after checkpoint access, license review, and a representative inference succeed. Separation quality does not establish the physical cause of a sound, nor guarantee better transcription.

### Images: understanding and generation need separate capabilities

Spark reads images and returns descriptions, extracted information, or grounding coordinates. Use it for the existing image analyzers. Source: [Image understanding](https://dev.meta.ai/docs/image-understanding).

Muse Image creates or edits images. Its documented ID is `muse-image-1.0`. Responses supports conversational editing; `/v1/images/generations` and `/v1/images/edits` support one-off operations. The Responses interface supports the `image_generation` tool, not arbitrary function tools. Source: [Image generation](https://dev.meta.ai/docs/image-generation).

For ARGUS, generated imagery must carry synthetic provenance. A proposed `generated_illustration` Observation can reference the facts it illustrates, but must never feed measured counts or stand in for source evidence. Charts, numeric labels, masks, and factual overlays should continue to be drawn by deterministic widgets. Image generation is optional until we have a concrete useful product for it.

### Other Meta models: register only when a product needs them

| Family | Documented capability | Integration decision |
| --- | --- | --- |
| Muse Glimmer | Open-weight text/image model for local deployment | Future local adapter; not a hosted Model API ID |
| Muse Spark Open | Open-weight multimodal reasoning | Future provider/self-host adapter; not assumed to run on our Next.js host |
| DINOv3 | Dense visual features | Optional image/crop embedding service for similarity or change proposals |
| Perception Encoder | Visual embeddings | Alternative embedding service to evaluate against DINOv3 |
| ImageBind | Shared multimodal embeddings | Optional audio/image retrieval; similarity does not prove event identity |
| Omnilingual ASR | Broad multilingual speech recognition | Optional self-hosted transcription alternative for a language the hosted path cannot handle well |
| SAM 3D Objects / Body | Image-based object reconstruction / human mesh recovery | Later exploratory products; inferred geometry is not calibrated physical measurement |

Official sources: [Glimmer deployment](https://dev.meta.ai/docs/muse-glimmer/deploy), [Spark Open](https://dev.meta.ai/docs/muse-spark-open), [DINOv3](https://github.com/facebookresearch/dinov3), [Perception Encoder](https://github.com/facebookresearch/perception_models/blob/main/apps/pe/README.md), [ImageBind](https://github.com/facebookresearch/ImageBind), [Omnilingual ASR](https://github.com/facebookresearch/omnilingual-asr), [SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects), [SAM 3D Body](https://github.com/facebookresearch/sam-3d-body).

These research families require their own runtime, checkpoint, preprocessing, and license checks. They are extension candidates, not dependencies for the first demo. Do not treat an image embedding model as a verified person re-identification system.

## 2. What ARGUS currently does

The inspected working tree has these integration points:

| Area | Current implementation | Gap |
| --- | --- | --- |
| Model client | `src/lib/meta.ts`: one `chatModel()`, selected by `META_MODEL` | No per-capability model routing or non-chat adapters |
| Setup | `src/lib/agents/orchestrator.ts`: product suggestions, lanes, links, code validation | Plans do not describe multiple model steps |
| Analyzer mapping | `src/lib/lane-kinds.ts`, `src/lib/setup-rules.ts`: `objects`, `body`, `screen`, and `WRITES` | One analyzer-to-output mapping cannot describe an entire multimodel workflow |
| Vision | `src/lib/perception.ts`, `body-check.ts`, `persona-review.ts` | Different prompts currently share the configured chat model |
| Ingestion | `src/lib/connectors.ts`, `src/sources/video.ts` | No SAM or audio adapter found in the inspected paths |
| Jobs | `src/lib/jobs.ts`, `src/lib/job-handlers.ts` | Need capability execution and durable model invocation state |
| Data contract | `src/products/schema.ts`, manifests, `src/products/index.ts` | Manifests describe consumed Observations/products, not capability prerequisites |
| Trace | `src/lib/trace.ts`, Studio Observatory | Summaries are deliberately truncated; insufficient as full replay response storage |
| Evidence | `src/db/schema.ts` | Existing `evidence` table links alerts to Observations; it is not a general derivation graph |

The [video census plan](version-map/0.3.0.md) is planning, not proof that SAM or embedding matching is implemented. Its “up to 16 objects per pass” assumption needs a separate limit check; the reviewed developer pages do not establish that as a universal hosted API limit.

## 3. Proposed registration model

Separate four concepts:

1. **Model:** a concrete model ID/checkpoint and provider endpoint.
2. **Capability:** a typed operation, such as `vision.segment` or `audio.transcribe`.
3. **Recipe:** a bounded workflow combining model capabilities and code.
4. **Product:** a manifest that reads Observations and promises an output schema.

Suggested files, all proposed:

```text
src/lib/models/registry.ts          concrete models, adapters, configuration
src/lib/models/capabilities.ts      typed capability contracts and output schemas
src/lib/models/execute.ts           validation, invocation, persistence, tracing
src/lib/models/adapters/
  meta-chat.ts                     preserve existing working chat path
  meta-responses.ts                multimodal reasoning and SAM transport
  meta-transcribe.ts               file ASR; live transport later
  meta-images.ts                   image generation/editing
  research-worker.ts               optional external GPU service
src/lib/agents/recipes.ts           reviewed workflow definitions
```

Expose typed reasoning functions from `src/lib/agents/orchestrator.ts`; keep data joining in `src/lib/fusion.ts`. Transport adapters should not decide product semantics.

### Registry contract

Each model entry should record:

- Stable internal ID, display name, provider model ID/checkpoint revision, adapter, and configuration reference.
- Supported capabilities and modalities; constraints verified for that adapter, not inferred from a model's marketing description.
- Deployment class: hosted Meta API, another provider, or our research worker.
- Runtime availability: `unconfigured`, `unverified`, `ready`, `unavailable`, or `disabled`, with the last checked time and reason.
- Pricing unit and versioned rate reference; timeout, concurrency, and supported cancellation behavior.
- Data mode and checkpoint/license reference where applicable.

Keep secrets out of registry objects returned to the client. A configured key makes the provider configured, not every model ready. An explicit smoke test promotes each capability to ready.

### Initial capability mapping

| Proposed capability | Preferred adapter/model | Proposed Observations or records |
| --- | --- | --- |
| `project.plan` | Chat / Spark | Versioned setup plan plus trace; analysis data still enters as Observations |
| `vision.describe` | Chat or Responses / Spark | `scene_description`, existing detection proposals |
| `vision.segment` | Responses / SAM 3.1 | `object_mask`, normalized `object_detected` |
| `video.track` | Responses / SAM 3.1 | `object_track` tied to response/clip/shot scope |
| `audio.transcribe` | ASR / Muse Voice Transcribe | `transcript_turn` |
| `audio.describe` | Responses / Spark | `audio_event_proposal` with time range when supported by returned evidence |
| `audio.separate` | Research worker / SAM Audio | `audio_separation` referencing target/residual artifacts |
| `image.generate`, `image.edit` | Images or Responses / Muse Image | `generated_illustration` with synthetic provenance |
| `vision.embed` | Research worker / evaluated encoder | `visual_embedding` referencing a versioned vector artifact |
| `evidence.explain` | Chat or Responses / Spark; Wonder optional | `analysis_claim` with supporting Observation IDs |
| `evidence.verify` | Deterministic code | Checked/rejected claims and trace; no model needed |

Do not force every capability through `generateText()`. Chat JSON, SAM token streams, ASR events, image bytes, and worker artifacts have different contracts.

### Routing and fallback rules

The author asks for an outcome. The planner chooses only registered recipes/products available to that project. Code resolves required capabilities to ready models and rejects missing dependencies before queueing expensive work.

Use model overrides per capability rather than changing one global `META_MODEL`. Preserve `META_MODEL` as a compatibility default for current chat calls during migration. Store the resolved IDs on each run so later environment changes do not rewrite its history.

Fallbacks must preserve the capability contract. Spark describing an image is not a replacement for SAM masks. Transcription is not a substitute for sound separation. A fallback records both attempted models and its reason; unavailable required geometry leaves a partial or blocked result rather than inventing it.

## 4. From goal to executable work

The current single-analyzer lanes can stay as the author-facing grouping. Introduce recipes behind them rather than adding a new lane for every model.

Example request: “Analyze this workshop video: show occupancy, what people said, and events worth reviewing.”

1. Match the request to implemented product manifests. Explain unsupported requests before execution.
2. Build a versioned plan containing selected products, sources, recipes, capabilities, dependencies, parameter bounds, and a budget estimate.
3. Validate that every required Observation can be produced and that all upstream products are enabled. Retain current lane/input compatibility checks.
4. Ingest source media and write source Observations. Record browser sampling/audio extraction as traced code steps reported to the server.
5. Run compatible branches: SAM for geometry/tracks, ASR for speech, Spark for scene/event proposals.
6. Normalize results into Observations. The model's text is never the product's database schema by itself.
7. Fuse by source media ID, explicit timestamps/ranges, and relevant asset/track scope. A temporal overlap is an association, not proof of causality.
8. Compute counts, durations, thresholds, and aggregates in code. Explain from those facts and verify cited claims.
9. Freeze the recorded run and replay it publicly from stored, permitted artifacts.

Structured output helps constrain the planner's response shape, but code must still verify IDs, dependencies, authorization, and budgets. Source: [Structured output](https://dev.meta.ai/docs/structured-output).

If the planner chooses a tool, ARGUS executes the registered function and records it. The model does not execute our application tools on its own. Source: [Tool calling](https://dev.meta.ai/docs/tool-calling).

### Manifest evolution

Add optional, validated recipe/capability requirements to the manifest contract, or a separate binding registry keyed by product ID for the first iteration. Do not maintain two independently editable versions of the same requirements.

Replace the single inferred analyzer requirement with a dependency check that can express “this product needs masks AND transcript turns.” Preserve `observationTypes` and upstream `inputs` as the product data contract. A new manifest is only `supported` after its producers, computation, widget, and replay work.

## 5. Observation, artifact, and replay contract

Keep large binary outputs in S3. Store references, dimensions, duration, hashes, coordinate conventions, and lineage in Postgres. Never put full masks, audio, base64 images, credentials, or signed URLs into trace summaries.

Proposed common provenance fields:

```text
runId, stepId, capabilityId, modelRegistryId, providerModelId,
modelRevision (when exposed), adapterVersion, schemaVersion,
requestHash, responseArtifactKey, inputObservationIds,
mediaId, clipStartMs, timestampMapVersion,
synthetic, estimate, parametersHash
```

Provider model names may be moving aliases. Save the reported version when available and preserve exact outputs even when a backend revision is not exposed. Do not claim reproducibility from the model ID alone.

New payloads should include:

- `object_mask`: source dimensions, frame index, original media offset, box coordinate convention, mask encoding/artifact key, optional score, response-local object ID.
- `object_track`: clip/shot scope, accepted mask Observation IDs, sampled appearance intervals, known gaps.
- `transcript_turn`: recording-local turn ID, start/end offsets, completed text, optional recording-local speaker label. Confidence remains absent/null if not supplied.
- `audio_separation`: prompt type, source range, target/residual keys, sample rate, input/output duration and alignment metadata.
- `generated_illustration`: generated artifact key, supporting fact IDs, prompt/template version, and `synthetic: true`.

Use source event time plus explicit media-relative offsets. Keep a timestamp map for sampling, resampling, clipping, and audio extraction. Never calculate a timestamp from returned line position. Sampled screen time should be labelled sampled/estimated rather than exact continuous presence.

### Proposed durable run storage

Add run/step records, a response-artifact reference, and general Observation-to-Observation derivation links. The existing alert evidence table should remain useful for alerts; it cannot represent all these dependencies alone.

Persist the provider response and artifact hashes separately from the readable trace. Current `small()` truncates text and arrays, which is correct for the Observatory but insufficient for a faithful replay. “Raw response” means the provider-visible output, not private model reasoning. Store any exposed summaries and tool events without claiming access to hidden chain of thought.

Make invocation identity deterministic over project, source content hash, capability, model, adapter/schema version, and parameters. Retries must not duplicate Observations or accidentally bill a completed step again. Persist provider request/response identifiers and completion state before retrying an uncertain call.

## 6. Execution and Observatory

Reuse the Postgres jobs queue. Introduce a capability-step job with typed payload validation and dependencies. Persist long-running provider task IDs and poll/resume them instead of keeping a request open indefinitely. Long research-worker jobs need leases/heartbeats: the current stale-job recovery can otherwise requeue a still-running GPU inference.

At entry points use `withTrace({ projectId, uploadId, userId })`, retaining job context. Wrap every call and meaningful transformation in `traced()`:

| Example step | Kind | What the replay should show |
| --- | --- | --- |
| `video.sample_frames` | `code` | Sampling policy, frame count, original timestamps |
| `sam.segment` | `model` | Actual model ID, concept/visual prompt summary, returned object count |
| `sam.decode_masks` | `code` | Parsing version, geometry validation, mask artifact references |
| `audio.transcribe` | `model` | Model, audio duration, completed turn count |
| `audio.separate` | `model` | Checkpoint ID, source range, output artifact references |
| `fusion.align_media` | `code` | Time window, matched Observation IDs, unmatched records |
| `products.compute_occupancy` | `code` | Rules, input masks, computed counts and limitations |
| `reasoning.explain` | `model` | Cited facts and proposed claims |
| `verification.check_claims` | `code` | Accepted/rejected claims and reasons |

Populate `observationIds` on steps that write rows. Record failures and retain the existing rule that trace-write failure must not break analysis.

Extend run usage beyond tokens: segmented images/frames, audio seconds, generated images, optional worker runtime, and estimated billed cost. Unknown usage is unknown, not zero. Public trace views need an explicit projection that filters private source text and media independently of owner-visible traces.

Replay modules read frozen run records, Observations, product outputs, and permitted S3 artifacts. They must not enqueue work or construct provider clients. Verification should reject provider requests during replay, while permitting normal application/database/media reads.

## 7. Cost and failure behavior

Documented rates on the research date:

| Model | Published standard billing |
| --- | --- |
| Spark | $1.25/M input tokens, $4.25/M output tokens; cached input priced separately |
| Wonder | $4/M input tokens, $20/M output tokens; cached input priced separately |
| SAM 3.1 image | $2.50/1,000 images |
| SAM 3.1 video | $0.20/1,000 frames; minimum 50 billed frames per video request |
| Muse Voice Transcribe | $0.18/hour of processed audio |
| Muse Image | $0.01/generated image |

Rates are a snapshot, not a quote for our account. Rate limits are team-scoped; honor `Retry-After` and use backoff with jitter. Source: [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits).

Proposed controls: limit clip length, sampling rate, concept requests, total frames/audio duration, and generated-image count before work starts. Track actual usage by resolved model and run. Use Standard model IDs by default; do not switch author data into Contributor mode silently.

Failures should be explicit per step. Missing ASR can leave a completed visual result with a missing-transcript status. Missing SAM cannot produce a geometry-dependent product. Preserve useful partial outputs and let the author retry the failed branch. Cache successful inference independently from downstream deterministic recomputation.

## 8. Recommended implementation order

### Phase A: registry and one verified API call per family

- Add typed registry, capability contracts, adapters, and availability checks. Preserve current chat behavior.
- Verify a small image with SAM, a short spoken recording with ASR, a structured Spark result, and optionally one generated illustration.
- Record sanitized fixtures, provider IDs, usage, artifacts, and errors. Prove the Observatory shows each step.
- Test denied access, missing key, timeout, rate limit, malformed output, and successful zero matches.

### Phase B: SAM product, Observation first

- Source writes media/frame Observations; SAM writes mask/detection Observations.
- Code validates geometry and computes instance counts and occupancy.
- Add the product manifest and registration, then its widget in `src/widgets/library/` and registry.
- Preview all UI states in `/design` inside a Group + Surface before wiring Studio or public pages.
- Record and replay the run without provider access. Keep cross-shot identity merging out of the first slice.

### Phase C: speech plus visual fusion

- Add an audio source under `src/sources/` and traced audio extraction for videos.
- Write transcript turns, join them to visual time windows in `src/lib/fusion.ts`, and expose typed explanation steps through the orchestrator.
- Add a transcript/event product manifest and a time-aligned widget, previewed in `/design` first.
- Test known synchronization offsets, silence, overlapping turns, failed ASR, and incomplete media.

### Phase D: optional capabilities

- Add a clearly labelled image illustration only when it improves a data product.
- Evaluate Wonder on difficult examples before making it a default.
- Add SAM Audio separation, embeddings, or 3D one at a time when a concrete showcase needs them. Each follows source → Observations → fusion → manifest → widget.

## 9. First hackathon story

Use an owned short workshop or event recording with visible objects and intelligible speech.

1. Spark interprets the scene and proposes a bounded plan.
2. SAM produces object masks and local tracks.
3. Muse Voice Transcribe produces speech turns.
4. Code computes occupancy and aligns visual intervals with speech.
5. Spark explains selected moments using cited Observations; code verifies claims.
6. Visitors scrub the replay, inspect masks, hear permitted audio, read aligned speech, and see which model/code step produced each result.

Optional SAM Audio lets visitors compare original and isolated sound. Optional Muse Image illustrates a verified summary, clearly separated from captured evidence. Neither should delay the three-family evidence pipeline.

## 10. Definition of done

- A plain-language request resolves only to supported, available recipes and products.
- Every invoked model is identified by its actual resolved ID in the run and Observatory.
- Every analyzed source and derived result has Observations and lineage.
- Counts and durations are computed from accepted records with explicit sampling limitations.
- Missing capability access is visible before execution; fallback is explicit and contract-compatible.
- Repeating/retrying a step does not duplicate its Observations.
- Full provider outputs and large artifacts are retained separately from trace summaries.
- All new visuals have `/design` surfaces covering empty, running, partial, success, and error states.
- Public media is explicitly permitted and filtered; generated images remain labelled synthetic.
- The published replay works with `META_API_KEY` unset and makes zero provider calls.

The immediate engineering target is a capability registry plus SAM and file-transcription adapters, followed by one complete recorded product. Registering every Meta research model can remain incremental; a registered entry only becomes usable after its adapter and end-to-end output are verified.
