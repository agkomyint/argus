/**
 * Loaded before every test file (bunfig.toml). Swaps the outside world for in-process fakes so the
 * real code runs unchanged: Postgres is PGlite with the real drizzle migrations, the Meta model is a
 * scripted reply, S3 is a Map, and Next's request-scoped helpers are no-ops.
 */
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { s3Store, scheduled, takeReply } from "./fakes";

// Force test values: a parent `bun run` (release, check) loads .env.local and passes real keys down.
process.env.META_MODEL = "test-model";
delete process.env.META_API_KEY;
delete process.env.META_BASE_URL;

const client = new PGlite();
export const testDb = drizzle(client, { schema });
await migrate(testDb, { migrationsFolder: "drizzle" });

// Production uses postgres-js, whose execute() resolves to the row array. PGlite resolves to { rows }.
// Match production so code that indexes the result of db.execute() behaves the same under test.
const execute = testDb.execute.bind(testDb);
testDb.execute = (async (query: Parameters<typeof execute>[0]) => (await execute(query)).rows) as unknown as typeof testDb.execute;

mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));

// `after()` only exists inside a Next request. Callbacks are kept; tests run them with runAfter().
mock.module("next/server", () => ({ after: (cb: () => unknown) => void scheduled.push(cb) }));

// Every model call returns the next scripted reply (see fakes.ts). Output.object is passed through.
mock.module("ai", () => ({
  Output: { object: (o: unknown) => o },
  generateText: async (req: unknown) => ({ output: await takeReply(req) }),
}));

mock.module("@/lib/s3", () => ({
  s3: {
    write: async (key: string, body: Uint8Array | string) => void s3Store.set(key, typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body)),
    file: (key: string) => ({
      text: async () => new TextDecoder().decode(s3Store.get(key)),
      arrayBuffer: async () => s3Store.get(key)?.buffer ?? new ArrayBuffer(0),
      exists: async () => s3Store.has(key),
      delete: async () => void s3Store.delete(key),
    }),
  },
  presignUpload: (key: string) => `https://s3.test/${key}?put`,
  presignDownload: (key: string) => `https://s3.test/${key}?get`,
}));
