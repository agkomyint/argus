import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, projectProducts, projects, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import { loadEngine, loadSources } from "@/lib/engine";
import { recordObservation } from "@/lib/observations";
import * as ops from "@/lib/ops";
import { loadReplay } from "@/lib/replay";
import { srcKey, tlKey } from "@/lib/source-key";
import { reset, seedProject } from "../db";
import { runAfter, scheduled } from "../fakes";

beforeEach(reset);

const NOPE = "00000000-0000-4000-8000-000000000000";

const rejects = async (p: Promise<unknown>, message: string, status = 400) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ops.OpsError);
  expect(err).toMatchObject({ message, status });
};

const jobsOf = (projectId: string) => db.select().from(jobs).where(eq(jobs.projectId, projectId));

describe("projects", () => {
  test("create, list and own", async () => {
    const { user } = await seedProject();
    await rejects(ops.createProject(user.id, " x ", ["people-count"]), "Give the project a name of 2 to 80 characters");
    await rejects(ops.createProject(user.id, "x".repeat(81), ["people-count"]), "Give the project a name of 2 to 80 characters");
    await rejects(ops.createProject(user.id, "Shop", ["nope", "structural-defect-map"]), "Unknown or unavailable data product: nope, structural-defect-map. Call list_products for the ids.");
    await rejects(ops.createProject(user.id, "Shop", []), "Pick at least one data product");
    const p = await ops.createProject(user.id, "  Shop  ", ["people-count", "people-count"]);
    expect(p).toMatchObject({ name: "Shop", kind: "other" });
    expect(await db.select().from(projectProducts).where(eq(projectProducts.projectId, p.id))).toHaveLength(1);
    expect((await ops.listProjects(user.id)).map((x) => x.name)).toEqual(["Project " + user.id.split("-")[1], "Shop"]);
    expect((await ops.ownProject(user.id, p.id)).id).toBe(p.id);
    await rejects(ops.ownProject(user.id, "not-a-uuid"), "Project not found", 404);
    await rejects(ops.ownProject("someone-else", p.id), "Project not found", 404);
    expect(ops.listProducts().length).toBeGreaterThan(0);
  });

  test("setProducts adds idempotently and removes", async () => {
    const { user, project } = await seedProject();
    await ops.setProducts(user.id, project.id, { add: ["people-count", "attribute-breakdown"] });
    await ops.setProducts(user.id, project.id, { add: ["people-count"], remove: ["attribute-breakdown"] });
    await ops.setProducts(user.id, project.id, {});
    expect((await db.select().from(projectProducts).where(eq(projectProducts.projectId, project.id))).map((r) => r.productId)).toEqual(["people-count"]);
  });
});

describe("sources", () => {
  test("files make a timeline, with or without lanes", async () => {
    const { user, project } = await seedProject();
    const bare = await ops.addSource(user.id, project.id, "files");
    expect(bare).toMatchObject({ key: tlKey(bare.id), kind: "files", name: "Files", next: "Add a lane (what the files show), then drop files onto it in the Studio." });
    const laned = await ops.addSource(user.id, project.id, "files", { name: "Drone", lanes: [{ name: "North", note: "deck" }, { name: "South" }] });
    expect(laned.next).toBe("Drop files onto the lanes in the Studio.");
    expect((await db.select().from(sourceLanes)).map((l) => [l.name, l.note])).toEqual([["North", "deck"], ["South", ""]]);
  });

  test("polled sources start when configured; others explain what is next", async () => {
    const { user, project } = await seedProject();
    await rejects(ops.addSource(user.id, project.id, "fax" as ops.SourceKind), "Unknown source kind. Use one of: files, screen, weather, sensor_sim, webhook");
    await rejects(ops.addSource(user.id, project.id, "weather", { lat: 1 }), "Weather needs both lat and lng");
    await rejects(ops.addSource(user.id, project.id, "weather", { lat: 100, lng: 0 }), expect.stringContaining("") as unknown as string);

    const w = await ops.addSource(user.id, project.id, "weather", { lat: 1, lng: 2 });
    expect(w).toMatchObject({ key: srcKey(w.id), name: "Weather feed", next: "Polling started." });
    expect((await ops.addSource(user.id, project.id, "weather")).next).toBe("Configure it with lat and lng to start.");
    const s = await ops.addSource(user.id, project.id, "sensor_sim", { asset: "Pier A" });
    expect((await db.select().from(sources).where(eq(sources.id, s.id)))[0].config).toEqual({ asset: "Pier A", surge: false });
    expect((await ops.addSource(user.id, project.id, "sensor_sim")).next).toBe("Configure it with an asset name to start.");
    expect(await ops.addSource(user.id, project.id, "screen")).toMatchObject({ key: "screen", next: expect.stringContaining("Start capture") });
    const hook = await ops.addSource(user.id, project.id, "webhook");
    expect("ingest" in hook && hook.ingest).toEqual({ path: `/api/ingest/${hook.id}`, key: expect.any(String) });
    expect((await jobsOf(project.id)).map((j) => j.source).sort()).toEqual([srcKey(s.id), srcKey(w.id)].sort());
  });

  test("configureSource sets weather and sensor settings only", async () => {
    const { user, project } = await seedProject();
    const w = await ops.addSource(user.id, project.id, "weather");
    const s = await ops.addSource(user.id, project.id, "sensor_sim");
    const h = await ops.addSource(user.id, project.id, "webhook");
    await rejects(ops.configureSource(user.id, project.id, "bad", {}), "Source not found", 404);
    await rejects(ops.configureSource(user.id, project.id, NOPE, {}), "Source not found", 404);
    await rejects(ops.configureSource(user.id, project.id, w.id, { name: "" }), expect.any(String) as unknown as string);
    await rejects(ops.configureSource(user.id, project.id, w.id, { lat: 1 }), "Weather needs lat and lng");
    await rejects(ops.configureSource(user.id, project.id, s.id, {}), "A sensor needs an asset name");
    await rejects(ops.configureSource(user.id, project.id, h.id, {}), "Only weather and sensor sources have settings");
    await ops.configureSource(user.id, project.id, w.id, { lat: 1, lng: 2, name: "Rain" });
    await ops.configureSource(user.id, project.id, s.id, { asset: "P1", surge: true });
    const rows = await db.select().from(sources);
    expect(rows.find((r) => r.id === w.id)).toMatchObject({ name: "Rain", config: { lat: 1, lng: 2 } });
    expect(rows.find((r) => r.id === s.id)?.config).toEqual({ asset: "P1", surge: true });
    expect(await jobsOf(project.id)).toHaveLength(2);
  });

  test("pause parks queued work and resume brings it back", async () => {
    const { user, project } = await seedProject();
    const w = await ops.addSource(user.id, project.id, "weather", { lat: 1, lng: 2 });
    const tl = await ops.addSource(user.id, project.id, "files");
    await rejects(ops.setSourcePaused(user.id, project.id, "files", true), "Unknown source key. Use the key from get_project.");
    await rejects(ops.setSourcePaused(user.id, project.id, "zzz", true), "Unknown source key. Use the key from get_project.");

    await ops.setSourcePaused(user.id, project.id, w.key, true);
    expect((await jobsOf(project.id))[0].status).toBe("paused");
    expect((await db.select().from(sources).where(eq(sources.id, w.id)))[0].paused).toBe(true);
    await ops.setSourcePaused(user.id, project.id, w.key, false);
    expect((await jobsOf(project.id))[0].status).toBe("queued");

    await ops.setSourcePaused(user.id, project.id, tl.key, true);
    expect((await db.select().from(timelines).where(eq(timelines.id, tl.id)))[0].paused).toBe(true);

    // No screen row yet: pausing creates one to hold the state; a second pause updates it.
    await ops.setSourcePaused(user.id, project.id, "screen", true);
    await ops.setSourcePaused(user.id, project.id, "screen", false);
    const screens = (await db.select().from(sources)).filter((s) => s.kind === "screen");
    expect(screens.map((s) => s.paused)).toEqual([false]);
  });

  test("retrySource requeues failed work with fresh tries", async () => {
    const { user, project } = await seedProject();
    await rejects(ops.retrySource(user.id, project.id, "zzz"), "Unknown source key");
    await db.insert(jobs).values([
      { projectId: project.id, kind: "analyze_frame", source: "screen", status: "failed", attempts: 3, error: "boom" },
      { projectId: project.id, kind: "analyze_frame", source: "screen", status: "done" },
    ]);
    expect(await ops.retrySource(user.id, project.id, "screen")).toBe(1);
    const back = (await jobsOf(project.id)).find((j) => j.status === "queued")!;
    expect(back).toMatchObject({ attempts: 0, error: null, finishedAt: null });
  });

  test("resuming and retrying wake the queue after the response", async () => {
    const { user, project } = await seedProject();
    await db.insert(jobs).values({ projectId: project.id, kind: "investigate", source: "screen", status: "failed", payload: { observationId: "00000000-0000-4000-8000-000000000000" } });
    await ops.setSourcePaused(user.id, project.id, "screen", true);
    expect(scheduled).toHaveLength(0);
    await ops.setSourcePaused(user.id, project.id, "screen", false);
    await ops.retrySource(user.id, project.id, "screen");
    expect(scheduled).toHaveLength(2);
    await runAfter();
    expect((await jobsOf(project.id))[0].attempts).toBe(1);
  });
});

describe("tune", () => {
  test("level by name or index, seconds from the list", async () => {
    const { user, project } = await seedProject();
    expect(await ops.setTune(user.id, project.id, { level: "careful", seconds: 30 })).toMatchObject({ level: "Careful", seconds: 30 });
    expect((await ops.setTune(user.id, project.id, { level: 99 })).level).toBe("Maximum");
    expect((await ops.setTune(user.id, project.id, { level: -3 })).level).toBe("Lean");
    expect(await ops.setTune(user.id, project.id, {})).toMatchObject({ level: "Lean", seconds: 30 });
    await rejects(ops.setTune(user.id, project.id, { level: "Turbo" }), `Unknown level. Use one of: ${ops.LEVEL_NAMES.join(", ")}`);
    await rejects(ops.setTune(user.id, project.id, { seconds: 7 }), `seconds must be one of: ${ops.FREQUENCY_SECONDS.join(", ")}`);
    expect((await db.select().from(projects).where(eq(projects.id, project.id)))[0]).toMatchObject({ agentLevel: 0, frequency: 30 });
    expect(ops.describeTune(2, 10)).toMatchObject({ level: "Balanced", costPer100Photos: 1.8 });
  });
});

describe("reading a project", () => {
  test("getProject sums products, sources and agents", async () => {
    const { user, project } = await seedProject();
    await ops.setProducts(user.id, project.id, { add: ["people-count", "density-heatmap"] });
    await db.insert(projectProducts).values({ projectId: project.id, productId: "gone-product" });
    const w = await ops.addSource(user.id, project.id, "weather", { lat: 1, lng: 2 });
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(), payload: { count: 4 } });
    const r = await ops.getProject(user.id, project.id);
    expect(r.products.map((p) => [p.id, p.state, p.rows])).toEqual([["people-count", "done", "1 rows"], ["density-heatmap", expect.any(String), expect.anything()]]);
    // The weather lane's hidden "Lanes" timeline holds no files, so it is not a source of its own.
    expect(r.sources).toEqual([expect.objectContaining({ key: w.key, type: "weather", state: "working", total: 1 })]);
    expect(r.agents.map((a) => a.name)).toEqual(["Normalize readings", "Correlate & check"]);
  });

  test("getDataset reads one product's rows, newest first", async () => {
    const { user, project } = await seedProject();
    await rejects(ops.getDataset(user.id, project.id, "nope"), "Unknown data product", 404);
    await rejects(ops.getDataset(user.id, project.id, "people-count", "weather"), "Unknown dataset. This product has: people_count");
    expect(await ops.getDataset(user.id, project.id, "density-heatmap")).toMatchObject({ type: "object_detected", total: 0 });
    for (const [i, count] of [3, 5].entries()) await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(Date.UTC(2026, 0, 1, i)), payload: { count } });
    const d = await ops.getDataset(user.id, project.id, "people-count", undefined, 0);
    expect(d).toMatchObject({ product: "people-count", type: "people_count", total: 2 });
    expect(d.rows).toEqual([{ observedAt: "2026-01-01T01:00:00.000Z", count: 5 } as (typeof d.rows)[number]]);
  });
});

describe("engine", () => {
  test("loadSources reads state from the job queue for every kind", async () => {
    const { user, project } = await seedProject();
    const tl = await ops.addSource(user.id, project.id, "files", { name: "Drone" });
    await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: "k", filename: "loose.jpg", contentType: "image/jpeg", size: 1, status: "ready" });
    const [s1] = await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "Cam", ingestKey: "a", paused: true }).returning();
    await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "Cam 2", ingestKey: "b" });
    await db.insert(sources).values({ projectId: project.id, kind: "unknown", name: "?", ingestKey: "c" });
    const [fresh] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Fresh", ingestKey: "d", lastSeenAt: new Date() }).returning();
    const [old] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Old", ingestKey: "e" }).returning();
    const [idle] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Idle", ingestKey: "f" }).returning();
    const [held] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Held", ingestKey: "g", paused: true }).returning();
    await recordObservation({ projectId: project.id, sourceId: old.id, type: "event", eventTime: new Date(), payload: {} });
    await db.update(sources).set({ lastSeenAt: null }).where(eq(sources.id, old.id));
    await db.insert(jobs).values([
      { projectId: project.id, kind: "process_upload", source: tl.key, status: "failed" },
      { projectId: project.id, kind: "process_upload", source: tl.key, status: "done" },
      { projectId: project.id, kind: "process_upload", source: "files", status: "done" },
    ]);
    const s = await loadSources(project.id);
    const by = (key: string) => s.find((x) => x.key === key)!;
    expect(by(tl.key)).toMatchObject({ state: "error", done: 1, total: 2, failed: 1, unit: "files" });
    expect(by("files")).toMatchObject({ canPause: false, state: "done" });
    expect(s.filter((x) => x.key === "screen")).toEqual([expect.objectContaining({ name: s1.name, state: "paused" })]);
    expect(by(srcKey(fresh.id)).state).toBe("working");
    expect(by(srcKey(old.id))).toMatchObject({ state: "done", done: 1 });
    expect(by(srcKey(idle.id)).state).toBe("waiting");
    expect(by(srcKey(held.id)).state).toBe("paused");
    expect(s).toHaveLength(7);
  });

  test("frames captured with no screen row still show a screen line", async () => {
    const { project } = await seedProject();
    await db.insert(jobs).values({ projectId: project.id, kind: "analyze_frame", source: "screen", status: "queued" });
    const [line] = await loadSources(project.id);
    expect(line).toMatchObject({ key: "screen", name: "Screen share", state: "working", canPause: false });
  });

  test("loadEngine wires sources → agents → fusion → layers → products", async () => {
    const { user, project } = await seedProject();
    await ops.setProducts(user.id, project.id, { add: ["people-count", "density-heatmap", "object-detection-dataset"] });
    const tl = await ops.addSource(user.id, project.id, "files");
    await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "Cam", ingestKey: "s" });
    await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Hook", ingestKey: "h" });
    await db.insert(jobs).values([
      { projectId: project.id, kind: "analyze_frame", source: "screen", status: "queued" },
      { projectId: project.id, kind: "process_upload", source: tl.key, status: "failed" },
      { projectId: project.id, kind: "investigate", status: "done" },
    ]);
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(), payload: { count: 1 } });
    await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(), payload: {} });
    await recordObservation({ projectId: project.id, type: "custom_event", eventTime: new Date(), payload: {} });

    const e = await loadEngine(project.id, { level: 2, frequency: 10 });
    const node = (id: string) => e.nodes.find((x) => x.id === id);
    expect(node("a:perceive")).toMatchObject({ state: "working", rate: "0 done" });
    expect(node("a:inspect")).toMatchObject({ state: "error", rate: "0 done · 1 failed" });
    expect(node("a:validate")).toMatchObject({ state: "waiting", rate: undefined });
    expect(node("a:normalize")).toBeUndefined();
    expect(node("f:correlate")).toMatchObject({ rate: "1 cases" });
    expect(node("l:people_count")).toMatchObject({ state: "working", rate: "1 rows" });
    expect(node("l:custom_event")).toMatchObject({ label: "custom event", state: "done" });
    expect(node("l:object_track")).toMatchObject({ state: "waiting" });
    expect(node("p:people-count")?.state).toBe("working");
    expect(node("p:density-heatmap")).toMatchObject({ sub: "spatial-layer", state: "waiting", rate: "0 rows" });
    expect(e.edges).toContainEqual(["f:correlate", "l:defect_detected"]);
    expect(e.edges).toContainEqual(["a:validate", "l:custom_event"]);
    expect(e.summary).toMatchObject({ working: 1, failed: 1, level: "Balanced", live: 2 });
    expect(e.summary.costPerHour).toBeGreaterThan(0);
  });

  test("held feeds hold their agent and layers", async () => {
    const { user, project } = await seedProject();
    await ops.setProducts(user.id, project.id, { add: ["people-count"] });
    await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "Cam", ingestKey: "s", paused: true });
    await db.insert(jobs).values({ projectId: project.id, kind: "analyze_frame", source: "screen", status: "paused" });
    const e = await loadEngine(project.id, { level: 0, frequency: 10 });
    expect(e.nodes.find((x) => x.id === "a:perceive")?.state).toBe("paused");
    expect(e.nodes.find((x) => x.id === "p:people-count")?.state).toBe("paused");
    expect(e.summary).toMatchObject({ paused: 1, costPerHour: 0, live: 0 });
  });
});

describe("replay", () => {
  test("unknown project", async () => {
    expect(await loadReplay(NOPE)).toBeNull();
  });

  test("plays back products, sources, uploads, jobs and rows; public hides filenames", async () => {
    const { user, project } = await seedProject();
    await ops.setProducts(user.id, project.id, { add: ["people-count"] });
    const tl = await ops.addSource(user.id, project.id, "files", { name: "Drone" });
    const w = await ops.addSource(user.id, project.id, "weather", { lat: 1, lng: 2 });
    await db.insert(sources).values({ projectId: project.id, kind: "screen", name: "Cam", ingestKey: "s" });
    await db.insert(uploads).values([
      { projectId: project.id, userId: user.id, key: "a", filename: "secret.jpg", contentType: "image/jpeg", size: 1, status: "ready", timelineId: tl.id },
      { projectId: project.id, userId: user.id, key: "b", filename: "loose.jpg", contentType: "image/jpeg", size: 1, status: "ready" },
    ]);
    await db.update(jobs).set({ status: "done", finishedAt: new Date() }).where(eq(jobs.projectId, project.id));
    await db.insert(jobs).values([
      { projectId: project.id, kind: "process_upload", source: tl.key, status: "failed" },
      { projectId: project.id, kind: "investigate", status: "running" },
      { projectId: project.id, kind: "mystery", status: "done" },
    ]);
    await recordObservation({ projectId: project.id, sourceId: w.id, type: "weather", eventTime: new Date(), payload: {} });
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(), payload: {} });
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(), payload: {} });

    const r = (await loadReplay(project.id))!;
    const texts = r.events.map((x) => x.text);
    expect(texts).toContain(`Project “${project.name}” created`);
    expect(texts).toContain("Chose the data product People count");
    expect(texts).toContain("Added the files timeline Drone");
    expect(texts).toContain("Uploaded secret.jpg");
    expect(texts).toContain("Normalize readings finished new readings from Weather feed");
    expect(texts).toContain("Inspect photos failed on a file from Drone");
    expect(texts).toContain("First people counts rows arrived");
    expect(r.arrivals["l:people_count"]).toEqual([[expect.any(Number), 2]]);
    expect(r.feeds["p:people-count"]).toEqual(["l:people_count"]);
    expect(r.jobs.find((j) => j.nodes.includes("f:correlate"))?.to).toBeNull();
    for (const node of r.nodes) expect(r.born[node.id]).toBeGreaterThanOrEqual(r.start);
    expect(r.events.map((x) => x.t)).toEqual([...r.events.map((x) => x.t)].sort((a, b) => a - b));

    const pub = (await loadReplay(project.id, "public"))!;
    expect(pub.events.some((x) => x.text.includes("secret.jpg"))).toBe(false);
    expect(pub.events.filter((x) => x.text === "Uploaded a file")).toHaveLength(2);
  });
});
