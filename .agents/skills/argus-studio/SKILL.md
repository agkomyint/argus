---
name: argus-studio
description: Operate ARGUS Studio projects, configure products and source lanes, upload media, inspect Observations and traces, and verify replays using ARGUS MCP or browser Playwright. Also use when implementing a new ARGUS product, widget, or connector in this repository.
---

# ARGUS Studio

Turn the person's requested outcome into a configured project, compatible input lanes, and verified data products. Distinguish configuring an existing product from implementing a new capability. Do not promise an unimplemented analysis merely because a catalog entry exists.

## Start here

1. Identify the ARGUS origin, current account, and target project. Use supplied links, connected MCP tools, or the visible Projects screen. Do not reuse another session's project ids, account, or localhost origin.
2. When working in the repository, read root `AGENTS.md`; it remains authoritative. Paths below are relative to the ARGUS repository root, not this skill folder.
3. Inspect the current catalog instead of recalling product ids. From the repository root:

   ```sh
   bun run .agents/skills/argus-studio/scripts/catalog.ts
   bun run .agents/skills/argus-studio/scripts/catalog.ts --product speech-log
   ```

   This helper reads code only: no database, secrets, model calls, or project mutations. An installed copy can use `bun run <skill-directory>/scripts/catalog.ts --root <argus-repository>`.
4. Read only the relevant reference:

   | Task | Read |
   | --- | --- |
   | Configure projects/products/sources through MCP; understand lane compatibility | [operations.md](references/operations.md) |
   | Navigate Studio, create specialized lanes, upload media, share, or test with Playwright | [browser.md](references/browser.md) |
   | Implement a new product/widget/connector, locate code, or diagnose missing results | [development.md](references/development.md) |

## Choose the control surface

- Prefer connected ARGUS MCP tools for supported operations. Discover their actual names and schemas. The endpoint is `<origin>/api/mcp`; it is MCP, not a REST project CRUD endpoint.
- Use authenticated Studio browser controls for gaps: camera lanes, speech/body/persona file analyzers, lane feed editing, uploads, and sharing. Follow the browser tool's setup and permission rules. Playwright examples apply to a standard `page` or a documented browser tab's `.playwright` interface; no particular plugin is assumed installed.
- For requested code changes, use repository functions and tests. Local database access is not a substitute for the authenticated user workflow. Writing documentation or inspecting the catalog does not authorize mutating live projects or invoking paid models.

## Essential distinctions

- **Product**: registered manifest of what it consumes and displays. **Widget**: reusable visual component. **Lane**: named input with an analyzer and explicit product feeds. **Source**: underlying live connector; file/camera lanes use uploads instead of source rows.
- Everything becomes an **Observation**. Models propose; deterministic code computes. Products read stored Observations. Model/code/tool steps must remain traceable in Observatory.
- `input: "files", analyzer: "speech"` is an audio lane. There is no `input: "audio"`. `input: "camera", analyzer: "objects"` is a camera lane; screen share is a different input/path.
- Enabling a product can reuse existing data. It does not manufacture absent observations. Position-dependent products can queue SAM work for old pictures, so enabling one is not always free of model calls.
- A status of `supported` means selectable, not proof every advertised metric has an implemented producer. Inspect the actual writer and real output, especially for tracking/traffic/safety claims.

## Finish with evidence

For configuration, verify the account/project, enabled products, compatible feeds, and saved source settings. For ingestion, verify rows and traces, not just upload completion. An empty configured project is valid; call it ready for input rather than claiming analysis happened.

For replay, inspect `/explore/<slug>` and verify it reads recorded results without invoking models. Sharing needs user intent to publish; return the actual URL. `localhost` is local even when the app says public. Do not silently publish, expose personal media, create credentials, or start capture as a side effect of setup.

For code, preview new UI in `/design` first and run the relevant checks in `docs/TESTING.md`. Report changes, verification, remaining live-model/hardware checks, and the resulting project link when applicable. Existing authorization carries forward; do not ask again for routine steps already requested.
