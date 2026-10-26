import { beforeEach, expect, test } from "bun:test";
import { db } from "@/db";
import { observations, sources } from "@/db/schema";
import { POST } from "@/app/api/ingest/[sourceId]/route";
import { reset, seedProject } from "../db";

beforeEach(reset);

async function hook(over: Partial<typeof sources.$inferInsert> = {}) {
  const { project } = await seedProject();
  const [src] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Hook", ingestKey: "secret", ...over }).returning();
  return src;
}

const send = (sourceId: string, body: string, key: string | null = "secret") =>
  POST(new Request("http://test/api/ingest", { method: "POST", body, headers: key ? { "x-ingest-key": key } : {} }), { params: Promise.resolve({ sourceId }) });

test("rejects a bad id, a wrong key and a paused source", async () => {
  const src = await hook();
  expect((await send("nope", "{}")).status).toBe(404);
  expect((await send(src.id, "{}", "wrong")).status).toBe(401);
  expect((await send(src.id, "{}", null)).status).toBe(401);
  const held = await hook({ paused: true, ingestKey: "secret" });
  expect(await (await send(held.id, "{}")).json()).toEqual({ error: "This source is paused in ARGUS" });
});

test("rejects bodies that are not JSON or not observations", async () => {
  const src = await hook();
  expect((await send(src.id, "not json")).status).toBe(400);
  const bad = await send(src.id, JSON.stringify([{ type: "" }]));
  expect(bad.status).toBe(422);
  expect((await bad.json()).path).toEqual([0, "type"]);
  expect((await send(src.id, "[]")).status).toBe(422);
});

test("writes one or many observations with webhook provenance", async () => {
  const src = await hook();
  const one = await send(src.id, JSON.stringify({ type: "reading", eventTime: "2026-01-01T00:00:00Z", payload: { v: 1 }, confidence: 0.5, asset: "P1" }));
  expect(one.status).toBe(201);
  expect((await one.json()).accepted).toBe(1);
  expect((await (await send(src.id, JSON.stringify([{ type: "a" }, { type: "b" }]))).json()).accepted).toBe(2);
  const rows = await db.select().from(observations);
  expect(rows).toHaveLength(3);
  const first = rows.find((r) => r.type === "reading")!;
  expect(first).toMatchObject({ sourceId: src.id, confidence: 0.5, payload: { v: 1 }, provenance: { connector: "webhook", source: "Hook" } });
  expect(first.eventTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
