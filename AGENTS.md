<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Component-first workflow (required)

Before creating any new page, build the component first and preview it in `/design`.

1. Build the UI as a component under `src/components/` (`design/` for system pieces).
2. Add it to `src/app/design/page.tsx` inside a `Group` + `Surface` with a code (e.g. `PRD-04`). Show its variants (states, sizes, empty / loading / error) in that one surface.
3. Only after the variants look right in `/design`, wire the component into a real page.

No new route that renders new UI without a `/design` surface first.

## Project goal

ARGUS uses Meta AI models to turn many data sources into reusable data products. The user connects sources and gets charts and widgets. Vision is the first source, not the only one. See `docs/ROADMAP.md` for the full plan.

Rules from the roadmap: everything becomes an Observation. Models propose, deterministic code computes. The manifest is the contract.

## Adding a new capability (required)

The author states what they want in plain words. The agent then breaks it down before writing code.

1. Restate the request as one capability: what the user gets.
2. Check it against the project goal above. If it does not help turn sources into data products, say so and stop.
3. Map it to the current structure before building:
   - New source type → `src/sources/` connector that writes Observations.
   - New output → manifest in `src/products/manifests/` plus registration in `src/products/index.ts`.
   - New visual → component in `src/widgets/library/` plus entry in `src/widgets/registry.tsx`, previewed in `/design` per the component-first rule.
   - New reasoning step → function in `src/lib/agents/orchestrator.ts` with typed input and output. Fusion logic lives in `src/lib/fusion.ts`.
4. Build in that order: source writes Observations, fusion joins them, product manifest reads them, widget shows them. Never skip the Observation step.
