import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, evidence, jobs, observations, projectProducts, projects, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import { investigate, severityInput } from "@/lib/agents/orchestrator";
import { MAX_QUEUED_FRAMES, analyzeFrame, dropKeptFrames, enabledCaptureProducts } from "@/lib/capture";
import { newIngestKey, pollSource, processUpload, queuePoll } from "@/lib/connectors";
import { HANDLERS } from "@/lib/job-handlers";
import { drainJobs, enqueue, isPaused } from "@/lib/jobs";
import { recordObservation, upsertAsset } from "@/lib/observations";
import { perceiveImage, perceiveScene } from "@/lib/perception";
import { seedSample } from "@/lib/sample";
import { srcKey, tlKey } from "@/lib/source-key";
import { reset, seedProject } from "../db";
import { modelCalls, putFile, runAfter, s3Store, scheduled, scriptModel } from "../fakes";

beforeEach(reset);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const UNKNOWN = "123e4567-e89b-12d3-a456-426614174000";

async function upload(projectId: string, userId: string, filename: string, body: string | Uint8Array, over: Partial<typeof uploads.$inferInsert> = {}) {
  const key = `u/${crypto.randomUUID()}/${filename}`;
  putFile(key, body);
  const [u] = await db.insert(uploads).values({ projectId, userId, key, filename, contentType: "", size: 1, status: "ready", ...over }).returning();
  return u;
}

const jobRows = () => db.select().from(jobs);

describe("job queue", () => {
  test("isPaused reads timelines, sources and the screen hold", async () => {
    const { project } = await seedProject();
    const [tl] = await db.insert(timelines).values({ projectId: project.id, name: "T", paused: true }).returning();
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "weather", name: "W", ingestKey: "k" }).returning();
    expect(await isPaused(project.id, tlKey(tl.id))).toBe(true);
    expect(await isPaused(project.id, srcKey(src.id))).toBe(false);
    expect(await isPaused(project.id, srcKey(UNKNOWN))).toBe(false);
    expect(await isPaused(project.id, tlKey(UNKNOWN))).toBe(false);
    expect(await isPaused(project.id, "screen")).toBe(false);
    await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "S", ingestKey: "s", paused: true });
    expect(await isPaused(project.id, "screen")).toBe(true);
    expect(await isPaused(project.id, "files")).toBe(false);
    expect(await isPaused(project.id, "src:bad" as never)).toBe(false);
  });

  test("enqueue parks work for a held source", async () => {
    const { project } = await seedProject();
    const [tl] = await db.insert(timelines).values({ projectId: project.id, name: "T", paused: true }).returning();
    expect((await enqueue(project.id, "poll_source", {}, { source: tlKey(tl.id) })).status).toBe("paused");
    expect((await enqueue(project.id, "poll_source", {})).status).toBe("queued");
    // Only the queued job wakes the queue after the response.
    expect(scheduled).toHaveLength(1);
    await runAfter();
  });

  test("drainJobs runs handlers, retries failures and gives up after three attempts", async () => {
    const { project } = await seedProject();
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Hook", ingestKey: "k" }).returning();
    await enqueue(project.id, "poll_source", { sourceId: src.id }, { drain: false });
    const bad = await enqueue(project.id, "poll_source", { sourceId: UNKNOWN }, { drain: false });
    expect(await drainJobs()).toBe(2);
    const done = (await jobRows()).find((j) => j.id !== bad.id)!;
    expect(done).toMatchObject({ status: "done", result: { skipped: "Source kind webhook is push-only" } });

    for (let attempt = 2; attempt <= 3; attempt++) {
      let [j] = await db.select().from(jobs).where(eq(jobs.id, bad.id));
      expect(j).toMatchObject({ status: "queued", error: "Source not found" });
      await db.update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, bad.id));
      await drainJobs();
      [j] = await db.select().from(jobs).where(eq(jobs.id, bad.id));
      expect(j.attempts).toBe(attempt);
    }
    const [failed] = await db.select().from(jobs).where(eq(jobs.id, bad.id));
    expect(failed.status).toBe("failed");
    expect(failed.finishedAt).toBeInstanceOf(Date);
  });

  test("stale running jobs are recovered and max caps the run", async () => {
    const { project } = await seedProject();
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Hook", ingestKey: "k" }).returning();
    await db.insert(jobs).values({ projectId: project.id, kind: "poll_source", payload: { sourceId: src.id }, status: "running", runAt: new Date(Date.now() - 20 * 60_000) });
    for (let i = 0; i < 3; i++) await enqueue(project.id, "poll_source", { sourceId: src.id }, { drain: false });
    expect(await drainJobs(1)).toBeGreaterThanOrEqual(1);
    expect(await drainJobs()).toBeGreaterThan(0);
    expect((await jobRows()).every((j) => j.status === "done")).toBe(true);
  });

  test("a handler that throws a non-Error is recorded as text", async () => {
    const { project } = await seedProject();
    const original = HANDLERS.poll_source;
    HANDLERS.poll_source = async () => {
      throw "boom";
    };
    try {
      await enqueue(project.id, "poll_source", {}, { drain: false });
      await drainJobs();
      expect((await jobRows())[0].error).toBe("boom");
    } finally {
      HANDLERS.poll_source = original;
    }
  });
});

describe("perception", () => {
  test("image findings pass straight through", async () => {
    scriptModel({ findings: [{ label: "crack", kind: "defect", confidence: 0.9, description: "x" }] });
    expect(await perceiveImage(new Uint8Array([1]), "image/png", "ctx")).toHaveLength(1);
  });
  test("scene counts are clamped so the split always adds up", async () => {
    scriptModel({ people: 3, female: 0, male: 0, unclear: 0 });
    expect(await perceiveScene(new Uint8Array(), false)).toEqual({ people: 3 });
    scriptModel({ people: 4, female: 9, male: 9, unclear: 9 });
    expect(await perceiveScene(new Uint8Array(), true)).toEqual({ people: 4, apparent: { female: 4, male: 0, unclear: 0 } });
    scriptModel({ people: 5, female: 2, male: 1, unclear: 0 });
    expect(await perceiveScene(new Uint8Array(), true)).toEqual({ people: 5, apparent: { female: 2, male: 1, unclear: 2 } });
  });
});

describe("connectors: uploads", () => {
  test("rejects missing or unfinished uploads", async () => {
    const { project, user } = await seedProject();
    expect(processUpload(UNKNOWN)).rejects.toThrow("Upload not found or not complete");
    const u = await upload(project.id, user.id, "a.csv", "", { status: "pending" });
    expect(processUpload(u.id)).rejects.toThrow("Upload not found or not complete");
  });

  test("an asset list CSV becomes assets with aliases", async () => {
    const { project, user } = await seedProject();
    const u = await upload(project.id, user.id, "assets.csv", "name,kind,latitude,lon,aliases\nPier A,pier,1.5,2.5,P1|Pier-A\n,pier,,,\nPier B,,,,");
    expect(await processUpload(u.id)).toEqual({ assets: 3 });
    const { assets } = await import("@/db/schema");
    const rows = await db.select().from(assets).orderBy(assets.name);
    expect(rows.map((a) => [a.name, a.kind, a.lat, a.lng])).toEqual([["Pier A", "pier", 1.5, 2.5], ["Pier B", "asset", null, null]]);
  });

  test("inspection and record CSVs become observations; bad dates are skipped", async () => {
    const { project, user } = await seedProject();
    await upsertAsset(project.id, "Pier A");
    const insp = await upload(project.id, user.id, "insp.csv", "date,pier,rating,finding\n2025-01-01,Pier A,4,crack\n2025-02-01,Pier Q,6,ok\nnot a date,Pier A,5,x");
    expect(await processUpload(insp.id)).toEqual({ observations: 2, unmatched_assets: 1 });
    const rec = await upload(project.id, user.id, "rec.csv", "value\n12");
    expect(await processUpload(rec.id)).toEqual({ observations: 1, unmatched_assets: 0 });
    const types = (await db.select().from(observations)).map((o) => o.type).sort();
    expect(types).toEqual(["inspection", "inspection", "record"]);
    const empty = await upload(project.id, user.id, "empty.csv", "");
    expect(await processUpload(empty.id)).toEqual({ rows: 0 });
  });

  test("JSON arrays and {records} import; other shapes are skipped", async () => {
    const { project, user } = await seedProject();
    const arr = await upload(project.id, user.id, "a.json", JSON.stringify([{ Observed_At: "2025-01-01T00:00:00Z", Value: 3, Note: null }]));
    expect(await processUpload(arr.id)).toEqual({ observations: 1, unmatched_assets: 0 });
    const [o] = await db.select().from(observations);
    expect(o.payload).toEqual({ observed_at: "2025-01-01T00:00:00Z", value: 3, note: "" });
    const wrapped = await upload(project.id, user.id, "b.json", JSON.stringify({ records: [{ v: 1 }] }));
    expect(await processUpload(wrapped.id)).toEqual({ observations: 1, unmatched_assets: 0 });
    const bad = await upload(project.id, user.id, "c.json", JSON.stringify({ nope: 1 }));
    expect(await processUpload(bad.id)).toEqual({ skipped: "JSON must be an array of records" });
  });

  test("images go through perception with lane and asset hints", async () => {
    const { project, user } = await seedProject();
    await upsertAsset(project.id, "Pier A");
    const [tl] = await db.insert(timelines).values({ projectId: project.id, name: "Drone" }).returning();
    const [lane] = await db.insert(sourceLanes).values({ projectId: project.id, timelineId: tl.id, name: "North face", note: "close-ups" }).returning();
    const img = await upload(project.id, user.id, "pier-a_01.jpg", new Uint8Array([1, 2]), { laneId: lane.id, timelineId: tl.id });
    scriptModel({
      findings: [
        { label: "crack", kind: "defect", confidence: 0.9, description: "d" },
        { label: "Truck", kind: "object", confidence: 0.7, description: "t" },
        { label: "none", kind: "object", confidence: 0.1, description: "n" },
      ],
    });
    expect(await processUpload(img.id)).toEqual({ detections: 2, frames: 1 });
    const prompt = JSON.stringify(modelCalls[0]);
    expect(prompt).toContain("known monitored asset");
    expect(prompt).toContain('labelled this lane \\"North face\\": close-ups');
    expect(prompt).toContain("image/jpeg");
    const obs = await db.select().from(observations).orderBy(observations.type);
    expect(obs.map((o) => [o.type, o.assetId !== null, (o.payload as { lane?: string }).lane])).toEqual([
      ["defect_detected", true, "North face"],
      ["object_detected", true, "North face"],
    ]);
    expect((obs[1].payload as { object_class: string }).object_class).toBe("truck");
  });

  test("an image with no known asset or lane, and an unknown extension", async () => {
    const { project, user } = await seedProject();
    const img = await upload(project.id, user.id, "frame.webp", new Uint8Array([1]), { contentType: "image/webp" });
    const [lane] = await db.insert(sourceLanes).values({ projectId: project.id, timelineId: (await db.insert(timelines).values({ projectId: project.id, name: "T" }).returning())[0].id, name: "Plain" }).returning();
    const img2 = await upload(project.id, user.id, "frame.png", new Uint8Array([1]), { laneId: lane.id });
    scriptModel({ findings: [] }, { findings: [] });
    expect(await processUpload(img.id)).toEqual({ detections: 0, frames: 1 });
    expect(await processUpload(img2.id)).toEqual({ detections: 0, frames: 1 });
    expect(JSON.stringify(modelCalls[0])).toContain("not identified");
    expect(JSON.stringify(modelCalls[0])).toContain("image/webp");
    expect(JSON.stringify(modelCalls[1])).toContain('lane \\"Plain\\".');
    const txt = await upload(project.id, user.id, "notes.txt", "hi");
    expect(await processUpload(txt.id)).toEqual({ skipped: "No connector for .txt yet" });
  });
});

describe("connectors: polled sources", () => {
  test("weather writes past hours once and skips the future", async () => {
    const { project } = await seedProject();
    await upsertAsset(project.id, "Pier A");
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "weather", name: "W", config: { lat: 1, lng: 2, asset: "Pier A" }, ingestKey: newIngestKey() }).returning();
    const hour = (offset: number) => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + offset * 3_600_000).toISOString().slice(0, 16);
    let url = "";
    globalThis.fetch = (async (u: string) => {
      url = u;
      return Response.json({ hourly: { time: [hour(-2), hour(-1), hour(5)], precipitation: [1.2, null, 3], wind_speed_10m: [null, 9, 1] } });
    }) as unknown as typeof fetch;
    expect(await pollSource(src.id)).toEqual({ observations: 2 });
    expect(url).toContain("latitude=1&longitude=2");
    expect(await pollSource(src.id)).toEqual({ observations: 0 });
    const rows = await db.select().from(observations).orderBy(observations.eventTime);
    expect(rows.map((r) => r.payload)).toEqual([{ rain_mm: 1.2, wind_kmh: 0 }, { rain_mm: 0, wind_kmh: 9 }]);
    expect(rows.every((r) => r.assetId)).toBe(true);
  });

  test("weather errors surface the status", async () => {
    const { project } = await seedProject();
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "weather", name: "W", config: { lat: 1, lng: 2 }, ingestKey: "k" }).returning();
    globalThis.fetch = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect(pollSource(src.id)).rejects.toThrow("Open-Meteo returned 503");
  });

  test("the simulated sensor writes an hour of labelled readings, with a surge when asked", async () => {
    const { project } = await seedProject();
    const [calm] = await db.insert(sources).values({ projectId: project.id, kind: "sensor_sim", name: "S", config: {}, ingestKey: "a" }).returning();
    const [surge] = await db.insert(sources).values({ projectId: project.id, kind: "sensor_sim", name: "S2", config: { asset: "Pier A", surge: true }, ingestKey: "b" }).returning();
    expect(await pollSource(calm.id)).toEqual({ observations: 61, simulated: true } as Awaited<ReturnType<typeof pollSource>>);
    const second = await pollSource(calm.id);
    expect("observations" in second && second.observations).toBeLessThanOrEqual(1);
    await pollSource(surge.id);
    const surged = await db.select().from(observations).where(eq(observations.sourceId, surge.id));
    expect(Math.max(...surged.map((o) => (o.payload as { value: number }).value))).toBeGreaterThan(4);
    expect(surged.every((o) => (o.provenance as { simulated: boolean }).simulated)).toBe(true);
  });

  test("queuePoll enqueues against the source key", async () => {
    const { project } = await seedProject();
    const job = await queuePoll(project.id, UNKNOWN);
    expect(job).toMatchObject({ kind: "poll_source", source: srcKey(UNKNOWN), status: "queued" });
  });
});

describe("screen capture", () => {
  test("a missing frame is skipped", async () => {
    const { project } = await seedProject();
    expect(await analyzeFrame(project.id, { key: "gone" })).toEqual({ skipped: "frame is gone (stopped or already processed)" });
    expect(MAX_QUEUED_FRAMES).toBe(15);
  });

  test("no capture product means the frame is dropped unread", async () => {
    const { project } = await seedProject();
    putFile("f1", new Uint8Array([1]));
    expect(await analyzeFrame(project.id, { key: "f1" })).toEqual({ skipped: "no capture product is enabled" });
    expect(s3Store.has("f1")).toBe(false);
    expect(modelCalls).toHaveLength(0);
  });

  test("counts and attribute shares are recorded, then the frame is deleted", async () => {
    const { project } = await seedProject();
    await db.insert(projectProducts).values([{ projectId: project.id, productId: "people-count" }, { projectId: project.id, productId: "attribute-breakdown" }]);
    expect((await enabledCaptureProducts(project.id)).sort()).toEqual(["attribute-breakdown", "people-count"]);
    putFile("f2", new Uint8Array([1]));
    scriptModel({ people: 3, female: 1, male: 1, unclear: 1 });
    expect(await HANDLERS.analyze_frame({ id: "j", projectId: project.id, payload: { key: "f2", capturedAt: 1_700_000_000_000, session: "s1" } })).toEqual({ people: 3, kept: false });
    const obs = await db.select().from(observations).orderBy(observations.type);
    expect(obs.map((o) => [o.type, o.payload])).toEqual([
      ["attribute_breakdown", { female: 1, male: 1, unclear: 1, session: "s1" }],
      ["people_count", { count: 3, session: "s1" }],
    ]);
    expect(obs[0].eventTime.getTime()).toBe(1_700_000_000_000);
    expect(s3Store.has("f2")).toBe(false);
  });

  test("with media shared, the frame is kept and linked, until media is turned off", async () => {
    const { project } = await seedProject();
    await db.update(projects).set({ shareMedia: true }).where(eq(projects.id, project.id));
    await db.insert(projectProducts).values({ projectId: project.id, productId: "people-count" });
    putFile("f4", new Uint8Array([1]));
    scriptModel({ people: 2, female: 0, male: 0, unclear: 0 });
    expect(await analyzeFrame(project.id, { key: "f4", capturedAt: Date.now() })).toEqual({ people: 2, kept: true });
    expect(s3Store.has("f4")).toBe(true);
    const [row] = await db.select().from(observations);
    expect((row.provenance as { frame?: string }).frame).toBe("f4");
    expect(await dropKeptFrames(project.id)).toBe(1);
    expect(s3Store.has("f4")).toBe(false);
    const [after] = await db.select().from(observations);
    expect((after.provenance as { frame?: string }).frame).toBeUndefined();
    expect(after.payload).toEqual(row.payload);
  });

  test("attributes only, without the people count product", async () => {
    const { project } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "attribute-breakdown" });
    putFile("f3", new Uint8Array([1]));
    scriptModel({ people: 0, female: 0, male: 0, unclear: 0 });
    await analyzeFrame(project.id, { key: "f3", capturedAt: Date.now() });
    expect((await db.select().from(observations)).map((o) => o.type)).toEqual(["attribute_breakdown"]);
  });
});

const report = (over: Record<string, unknown> = {}) => ({
  title: "Crack on Pier A",
  summary: "s",
  claims: [],
  limitations: ["model limit"],
  recommendedAction: "Inspect",
  ...over,
});

describe("orchestrator", () => {
  test("severityInput takes the worst inspection rating", () => {
    const facts = { trigger: { confidence: 0.7 }, vibration: null, weather: null, inspections: [{ rating: 6 }, { rating: null }, { rating: 3 }, { rating: 5 }] };
    expect(severityInput(facts as never)).toEqual({ confidence: 0.7, vibrationRatio: null, rainMm24h: null, worstRating: 3 });
  });

  test("unknown observations throw", async () => {
    expect(investigate(UNKNOWN)).rejects.toThrow("Observation not found");
  });

  test("full lane: verification keeps cited claims and rejects the rest", async () => {
    const { project } = await seedProject({ agentConfig: { reasoning: { guidance: "Be brief." } } });
    await upsertAsset(project.id, "Pier A");
    const w = await recordObservation({ projectId: project.id, type: "weather", eventTime: new Date(Date.now() - 60_000), payload: { rain_mm: 12, wind_kmh: 5 } });
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), assetName: "Pier A", confidence: 0.82, payload: { label: "crack" } });
    scriptModel((req: unknown) => {
      expect(JSON.stringify(req)).toContain("Be brief.");
      return report({
        claims: [
          { text: "Confidence 82%", refs: [trig.id], numbers: [82] },
          { text: "Rain was 12 mm", refs: [w.id], numbers: [12] },
          { text: "No refs", refs: [], numbers: [] },
          { text: "Ghost", refs: [crypto.randomUUID()], numbers: [] },
          { text: "Made up 99", refs: [trig.id], numbers: [99] },
          { text: "Digits 7 unlisted", refs: [trig.id], numbers: [] },
        ],
      });
    });
    const r = await investigate(trig.id);
    expect(r).toMatchObject({ severity: "medium", claims: 3, rejected: 3 });
    const [alert] = await db.select().from(alerts);
    const rep = alert.report as { rejectedClaims: { reason: string }[]; trace: { agent: string }[]; lane: null; limitations: string[] };
    expect(rep.rejectedClaims.map((c) => c.reason)).toEqual(["no supporting observation cited", expect.stringContaining("cites unknown observation"), "number 99 is not in the fused facts"]);
    expect(rep.trace.map((s) => s.agent)).toEqual(["correlation", "analysis", "reasoning", "verification"]);
    expect(rep.lane).toBeNull();
    expect(rep.limitations).toContain("model limit");
    const ev = await db.select().from(evidence);
    expect(ev.map((e) => e.role).sort()).toEqual(["supporting", "trigger"]);
  });

  test("strict verification rejects digits that are not listed, and maxClaims caps the review", async () => {
    const { project } = await seedProject({ agentLevel: 4, agentConfig: { verification: { strict: null, maxClaims: 1 } } });
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), confidence: 0.6 });
    scriptModel(report({ title: "x".repeat(200), claims: [{ text: "Digits 7 unlisted", refs: [trig.id], numbers: [] }, { text: "ignored", refs: [trig.id], numbers: [] }] }));
    expect(await investigate(trig.id)).toMatchObject({ claims: 0, rejected: 1, severity: "low" });
    const [alert] = await db.select().from(alerts);
    expect(alert.title).toHaveLength(160);
    expect((alert.report as { rejectedClaims: { reason: string }[] }).rejectedClaims[0].reason).toContain("strict check");
  });

  test("quick lane writes a rules-only alert with no model call", async () => {
    const lanes = [{ id: "q", name: "Strong", enabled: true, from: 0, to: 1, recipe: "quick", level: null }];
    const { project } = await seedProject({ agentConfig: { lanes } });
    await upsertAsset(project.id, "Pier A");
    const strong = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), assetName: "Pier A", confidence: 0.95, payload: { label: "spalling" } });
    expect(await investigate(strong.id)).toMatchObject({ claims: 0, rejected: 0, severity: "medium" });
    const weak = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), confidence: 0.3 });
    await investigate(weak.id);
    expect(modelCalls).toHaveLength(0);
    const rows = await db.select().from(alerts).orderBy(alerts.createdAt);
    expect(rows.map((a) => a.title)).toEqual(["spalling on Pier A: medium severity", "Finding on an unmatched asset: low severity"]);
    expect(rows[0].summary).toBe("Flagged by rules only: detection confidence 0.95 (>= 0.80).");
    expect(rows[1].summary).toBe("Flagged by rules only: no severity rule fired.");
    expect((rows[0].report as { lane: string }).lane).toBe("Strong");
  });

  test("an observation from a project row that is gone still uses defaults", async () => {
    const { project } = await seedProject();
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), confidence: 0.6 });
    await db.update(projects).set({ agentConfig: {} }).where(eq(projects.id, project.id));
    scriptModel(report());
    expect((await investigate(trig.id)).claims).toBe(0);
  });
});

describe("job handlers", () => {
  test("process_upload investigates only the strongest finding above the threshold", async () => {
    const { project, user } = await seedProject({ agentConfig: { perception: { minConfidence: 0.6 } } });
    const img = await upload(project.id, user.id, "a.jpg", new Uint8Array([1]));
    scriptModel({
      findings: [
        { label: "crack", kind: "defect", confidence: 0.7, description: "a" },
        { label: "rust", kind: "defect", confidence: 0.9, description: "b" },
        { label: "chip", kind: "defect", confidence: 0.4, description: "c" },
      ],
    });
    const r = await HANDLERS.process_upload({ id: "j", projectId: project.id, payload: { uploadId: img.id } });
    expect(r).toEqual({ detections: 3, frames: 1, investigations: 1, reviews: 0 });
    const [job] = await db.select().from(jobs);
    const [rust] = await db.select().from(observations).where(eq(observations.confidence, 0.9));
    expect(job.payload).toEqual({ observationId: rust.id });

    const quiet = await upload(project.id, user.id, "b.jpg", new Uint8Array([1]));
    scriptModel({ findings: [] });
    expect(await HANDLERS.process_upload({ id: "j", projectId: project.id, payload: { uploadId: quiet.id } })).toEqual({ detections: 0, frames: 1, investigations: 0, reviews: 0 });
  });

  test("a screenshot in a persona project skips detection and goes to the persona panel", async () => {
    const { project, user } = await seedProject();
    await db.insert(projectProducts).values([{ projectId: project.id, productId: "persona-perception-map" }, { projectId: project.id, productId: "persona-agreement" }]);
    const shot = await upload(project.id, user.id, "home.png", new Uint8Array([1]));
    expect(await HANDLERS.process_upload({ id: "j", projectId: project.id, payload: { uploadId: shot.id } })).toEqual({ detections: 0, frames: 1, persona_panel: true, investigations: 0, reviews: 1 });
    expect(modelCalls).toHaveLength(0);
    const [job] = await db.select().from(jobs);
    expect(job.kind).toBe("review_screen");

    // Four personas look; one fails and is skipped. Code clamps positions and measures agreement.
    const view = (x: number) => ({ page: "Home", purpose: "p", clarity: 8, continue: true, quote: "q", attention: [{ label: "Logo", x, y: 0.2, weight: 1 }], friction: [] });
    scriptModel(view(0.5), view(0.5), () => { throw new Error("busy"); }, { ...view(4), continue: false, friction: [{ label: "Tiny links", x: 0.5, y: 0.9, severity: "high", issue: "Too small" }] });
    const r = await HANDLERS.review_screen({ id: "k", projectId: project.id, payload: { uploadId: shot.id } });
    expect(r).toMatchObject({ personas: 3, failed: 1 });
    const rows = await db.select().from(observations).where(eq(observations.projectId, project.id));
    expect(rows.filter((o) => o.type === "persona_view")).toHaveLength(3);
    const [fr] = rows.filter((o) => o.type === "persona_friction");
    expect(fr.payload).toMatchObject({ severity: "high", label: "Tiny links" });
    const views = rows.filter((o) => o.type === "persona_view").map((o) => o.payload as { attention: { x: number }[] });
    expect(Math.max(...views.map((v) => v.attention[0].x))).toBe(1);
    const [agree] = rows.filter((o) => o.type === "persona_agreement");
    expect(agree.payload).toMatchObject({ personas: 3, continue_share: 67, clarity_avg: 8 });
  });

  test("investigate does not duplicate an alert", async () => {
    const { project } = await seedProject();
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), confidence: 0.6 });
    scriptModel(report());
    await HANDLERS.investigate({ id: "j", projectId: project.id, payload: { observationId: trig.id } });
    expect(await HANDLERS.investigate({ id: "j", projectId: project.id, payload: { observationId: trig.id } })).toEqual({ skipped: "alert already exists" });
  });
});

describe("sample project", () => {
  test("seeds assets, history, sources, queued polls and a detection to investigate", async () => {
    const { project } = await seedProject();
    await seedSample(project.id);
    const obs = await db.select().from(observations);
    expect(obs.map((o) => o.type).sort()).toEqual(["defect_detected", "inspection", "inspection", "inspection"]);
    expect(obs.every((o) => o.assetId)).toBe(true);
    const queued = await db.select().from(jobs);
    expect(queued.map((j) => j.kind).sort()).toEqual(["investigate", "poll_source", "poll_source"]);

    const bare = await seedProject();
    await seedSample(bare.project.id, { withDetection: false });
    const bareObs = await db.select().from(observations).where(eq(observations.projectId, bare.project.id));
    expect(bareObs.some((o) => o.type === "defect_detected")).toBe(false);
  });
});
