# Testing

```sh
bun test                 # everything
bun test tests/lib/flow  # one file or folder
bun run test:watch
bun run test:coverage    # what CI runs: fails under the gate
bun run check            # lint + typecheck + test:coverage, the full CI check locally
```

Everything runs on Bun 1.4.4 (`packageManager` in `package.json`). No Docker, no Postgres, no network,
no API keys.

`bun run typecheck` runs `next typegen` first. It generates the global `PageProps`, `LayoutProps` and
`RouteContext` types into `.next/types`, which a fresh CI checkout does not have.

## How it works

`bunfig.toml` preloads `tests/preload.ts` before every test file. It swaps the outside world for
in-process fakes, so the real code runs unchanged:

| Real | Under test | Why |
| --- | --- | --- |
| Postgres (Supabase) | [PGlite](https://pglite.dev) in memory, with every migration in `drizzle/` applied | Real SQL: `FOR UPDATE SKIP LOCKED`, jsonb, `date_trunc`. Also proves the migrations apply cleanly. |
| Meta model (`ai` package) | Scripted replies: `scriptModel(...)` in `tests/fakes.ts` | Deterministic. Tests also read the prompts from `modelCalls`. |
| S3 (`@/lib/s3`) | A `Map` (`putFile`, `s3Store`) | No bucket needed |
| `after()` from `next/server` | Collected in `scheduled`; `runAfter()` runs them | Lets a test check that work is scheduled, and run it |
| `server-only` | Empty module | Lets server modules load outside Next |

PGlite returns `{ rows }` from `db.execute()` where postgres-js returns the row array. The preload makes
PGlite match production.

Helpers:

- `tests/db.ts` provides `reset()` (truncate every table and clear the fakes; use it in `beforeEach`) and
  `seedProject()` (a user plus one project they own).
- `tests/fakes.ts` provides `scriptModel`, `modelCalls`, `putFile`, `runAfter` and `scheduled`.
- Outbound HTTP (weather): swap `globalThis.fetch` in the test and restore it in `afterEach`.

## Layout

```
tests/
  preload.ts  fakes.ts  db.ts
  catalog.test.ts          products, widgets registry, flow graph validation
  lib/pure.test.ts         pure helpers (severity, csv, tune, source keys, ...)
  lib/data.test.ts         observations, fusion, api keys, datasets, explore
  lib/pipeline.test.ts     job queue, perception, connectors, capture, orchestrator, job handlers
  lib/flow.test.ts         every flow node, failure paths, drafting a flow
  lib/ops.test.ts          ops (dashboard, REST and MCP all call it), engine map, replay
  api/ingest.test.ts       the webhook route
  scripts/release.test.ts  the release script
```

## The coverage gate

`bun run test:coverage` fails if **any single file** falls under 95% of lines or functions
(`coverageThreshold` in `bunfig.toml`). Bun only measures files a test loads, so a new module with no
test does not count against the gate. Add a test with every new module.

In the gate: `src/lib/**`, `src/products/**`, `src/widgets/*.ts`, the ingest route and
`scripts/release-lib.ts`.

Out of the gate, and why:

| Not measured | Covered by instead | Plan |
| --- | --- | --- |
| UI (`src/**/*.tsx`) | The `/design` surfaces (component-first rule in `AGENTS.md`) | Browser smoke tests, see `docs/version-map/0.1.0.md` |
| `src/db/**` | Schema only. Every migration runs before each test run. | n/a |
| Route handlers and server actions that need a session (`src/app/api/**`, `src/app/*-actions.ts`) | The `ops`, `flow` and `jobs` functions they call are fully tested | Route tests with a faked session in 0.1.0 |
| `src/lib/auth.ts`, `session.ts`, `mcp/server.ts`, `s3.ts` | Thin adapters over Better Auth, MCP and Bun S3 | Covered by the 0.1.0 smoke test |

## Writing a test

- Test behaviour through the public function, with real rows in PGlite. Do not mock our own modules.
- Script every model reply the code path will ask for. An unscripted call throws
  `Model called with no scripted reply`.
- Sources read newest first. Seed rows with increasing `eventTime` and expect them reversed.
- If a test exposes a real bug, fix the code and keep the test. Note the fix in `CHANGELOG.md`.
