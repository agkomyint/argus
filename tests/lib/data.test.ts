import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { observations, projectProducts, projects, sources, timelines, uploads, user as users } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { KEY_PREFIX, createApiKey, listApiKeys, revokeApiKey, userForApiKey } from "@/lib/api-keys";
import { getShared, listShared } from "@/lib/explore";
import { correlate, factIndex } from "@/lib/fusion";
import { findAssetInText, matchAsset, recordObservation, upsertAsset } from "@/lib/observations";
import { loadLinked } from "@/lib/product-link";
import { loadDatasets } from "@/lib/product-data";
import { reset, seedProject } from "../db";

beforeEach(reset);

const MIN = 60_000;

describe("observations", () => {
  test("assets match by name, then alias, case-insensitively", async () => {
    const { project } = await seedProject();
    const a = await upsertAsset(project.id, "Pier A", { kind: "pier", lat: 1, lng: 2, aliases: ["P1", " ", "Bridge Pier 01"] });
    expect(a.kind).toBe("pier");
    expect(await matchAsset(project.id, " pier a ")).toBe(a.id);
    expect(await matchAsset(project.id, "p1")).toBe(a.id);
    expect(await matchAsset(project.id, "Pier Z")).toBeNull();
    expect(await findAssetInText(project.id, "IMG_bridge pier 01_north.jpg")).toBe(a.id);
    expect(await findAssetInText(project.id, "random.jpg")).toBeNull();
  });

  test("upsert keeps coordinates when the update has none", async () => {
    const { project } = await seedProject();
    await upsertAsset(project.id, "Pier A", { lat: 5, lng: 6 });
    const again = await upsertAsset(project.id, "Pier A");
    expect([again.lat, again.lng, again.kind]).toEqual([5, 6, "asset"]);
  });

  test("recordObservation links assets, keeps unmatched names visible and touches the source", async () => {
    const { project } = await seedProject();
    const a = await upsertAsset(project.id, "Pier A");
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "webhook", name: "Hook", ingestKey: "k" }).returning();
    const hit = await recordObservation({ projectId: project.id, sourceId: src.id, type: "record", eventTime: new Date(), assetName: "pier a", payload: { v: 1 } });
    expect(hit.assetId).toBe(a.id);
    expect(hit.payload).toEqual({ v: 1 });
    const miss = await recordObservation({ projectId: project.id, type: "record", eventTime: new Date(), assetName: "Ghost" });
    expect(miss.assetId).toBeNull();
    expect(miss.payload).toEqual({ unmatched_asset: "Ghost" });
    const [touched] = await db.select().from(sources);
    expect(touched.lastSeenAt).toBeInstanceOf(Date);
  });
});

describe("fusion", () => {
  test("unmatched trigger gets weather only and says why", async () => {
    const { project } = await seedProject();
    const t = new Date();
    const w = await recordObservation({ projectId: project.id, type: "weather", eventTime: new Date(t.getTime() - 2 * 60 * MIN), payload: { rain_mm: 4.5, wind_kmh: 20 } });
    await recordObservation({ projectId: project.id, type: "weather", eventTime: new Date(t.getTime() - 60 * MIN), payload: {} });
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: t, confidence: 0.8, payload: { label: "crack" } });
    const f = await correlate(trig, null);
    expect(f.asset).toBeNull();
    expect(f.weather).toEqual({ ids: [w.id, expect.any(String)], hours: 2, rainMm24h: 4.5, maxWindKmh: 20 });
    expect(f.limitations).toEqual(["The detection is not matched to any asset, so sensor and inspection history could not be joined."]);
    const idx = factIndex(f);
    expect(idx.ids.has(trig.id)).toBe(true);
    expect(idx.numbers).toEqual(expect.arrayContaining([0.8, 80, 2, 4.5, 20, 60]));
  });

  test("matched trigger joins vibration with a baseline, and inspections", async () => {
    const { project } = await seedProject();
    await upsertAsset(project.id, "Pier A");
    const t = Date.now();
    for (let m = 120; m >= 0; m -= 10) {
      await recordObservation({ projectId: project.id, type: "sensor_reading", eventTime: new Date(t - m * MIN), assetName: "Pier A", payload: { metric: "vibration_mm_s", value: m > 60 ? 2 : 4 } });
    }
    await recordObservation({ projectId: project.id, type: "sensor_reading", eventTime: new Date(t), assetName: "Pier A", payload: { metric: "temperature", value: 30 } });
    await recordObservation({ projectId: project.id, type: "inspection", eventTime: new Date(t - 400 * 24 * 60 * MIN), assetName: "Pier A", payload: { condition: "5", findings: "Scaling" } });
    await recordObservation({ projectId: project.id, type: "inspection", eventTime: new Date(t - 10 * 24 * 60 * MIN), assetName: "Pier A", payload: { rating: "n/a" } });
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(t), assetName: "Pier A", confidence: null });

    const f = await correlate(trig, "Pier A");
    expect(f.asset?.name).toBe("Pier A");
    expect(f.vibration).toMatchObject({ count: 7, windowMean: 4, baselineMean: 2, ratio: 2, windowMax: 4 });
    expect(f.inspections.map((i) => [i.rating, i.note])).toEqual([[null, null], [5, "Scaling"]]);
    expect(f.limitations).toEqual(["No weather observations in the 24 hours before the event."]);
    expect(factIndex(f).numbers).toContain(5);
  });

  test("simulated readings without history use the first half of the window, and missing data is listed", async () => {
    const { project } = await seedProject();
    const a = await upsertAsset(project.id, "Pier A");
    const t = Date.now();
    for (let m = 7; m >= 0; m--) {
      await db.insert(observations).values({ projectId: project.id, assetId: a.id, type: "sensor_reading", eventTime: new Date(t - m * MIN), payload: { metric: "vibration_mm_s", value: m >= 4 ? 1 : 3 }, provenance: { simulated: true } });
    }
    const trig = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(t), assetName: "Pier A", confidence: 0.5 });
    const f = await correlate(trig, "Pier A", 30);
    expect(f.vibration?.baselineMean).toBe(1);
    expect(f.vibration?.ratio).toBe(2);
    expect(f.limitations).toContain("No vibration history before the window; the first half of the window was used as the baseline.");
    expect(f.limitations).toContain("Vibration readings are simulated demo data, not from a physical sensor.");
    expect(f.limitations).toContain("No inspection history for this asset.");

    const bare = await recordObservation({ projectId: project.id, type: "defect_detected", eventTime: new Date(t - 5 * 24 * 60 * MIN), assetName: "Pier A" });
    expect((await correlate(bare, "Pier A")).limitations).toContain("No vibration readings for this asset around the event.");
  });

  test("a short window with no history leaves the ratio empty", async () => {
    const { project } = await seedProject();
    await upsertAsset(project.id, "Pier A");
    const trig = await recordObservation({ projectId: project.id, type: "sensor_reading", eventTime: new Date(), assetName: "Pier A", payload: { metric: "vibration_mm_s" } });
    const f = await correlate(trig, "Pier A");
    expect(f.vibration).toMatchObject({ count: 1, windowMean: 0, baselineMean: null, ratio: null });
  });
});

describe("api keys", () => {
  test("create, resolve, list and revoke", async () => {
    const { user } = await seedProject();
    const { id, key } = await createApiKey(user.id, "  ");
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(await userForApiKey(key)).toBe(user.id);
    expect(await userForApiKey("nope")).toBeNull();
    expect(await userForApiKey(KEY_PREFIX + "wrong")).toBeNull();
    const [row] = await listApiKeys(user.id);
    expect(row).toMatchObject({ id, name: "Coding agent", prefix: key.slice(0, KEY_PREFIX.length + 4) });
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    await revokeApiKey(user.id, id);
    expect(await listApiKeys(user.id)).toEqual([]);
  });
});

describe("admin", () => {
  test("reads the comma separated list", () => {
    const before = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = " Boss@Test.dev , ,ops@test.dev";
    expect(isAdmin("boss@test.dev")).toBe(true);
    expect(isAdmin("OPS@test.dev")).toBe(true);
    expect(isAdmin("nobody@test.dev")).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(isAdmin("boss@test.dev")).toBe(false);
    if (before !== undefined) process.env.ADMIN_EMAILS = before;
  });
});

describe("product links and datasets", () => {
  test("nothing linked on a fresh project", async () => {
    const { project } = await seedProject();
    expect(await loadLinked(project.id)).toEqual({ files: false, screen: false, sensor: false, weather: false });
  });

  test("each kind of source counts as linked", async () => {
    const { user, project } = await seedProject();
    await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: "k", filename: "a.csv", contentType: "text/csv", size: 1, status: "ready" });
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date() });
    await db.insert(sources).values([
      { projectId: project.id, kind: "webhook", name: "w", ingestKey: "1" },
      { projectId: project.id, kind: "weather", name: "x", ingestKey: "2" },
    ]);
    expect(await loadLinked(project.id)).toEqual({ files: true, screen: true, sensor: true, weather: true });

    const other = await seedProject();
    await db.insert(timelines).values({ projectId: other.project.id, name: "T" });
    await db.insert(sources).values([{ projectId: other.project.id, kind: "screen", name: "s", ingestKey: "3" }, { projectId: other.project.id, kind: "sensor_sim", name: "s", ingestKey: "4" }]);
    expect(await loadLinked(other.project.id)).toEqual({ files: true, screen: true, sensor: true, weather: false });
  });

  test("loadDatasets counts, orders and limits per type", async () => {
    const { project } = await seedProject();
    expect(await loadDatasets(project.id, [])).toEqual([]);
    for (let i = 0; i < 3; i++) await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(1_000_000 + i * MIN), payload: { count: i } });
    const [pc, none] = await loadDatasets(project.id, ["people_count", "weather"], 2);
    expect(pc.total).toBe(3);
    expect(pc.latest).toBe(1_000_000 + 2 * MIN);
    expect(pc.rows.map((r) => r.payload.count)).toEqual([1, 2]);
    expect(none).toEqual({ type: "weather", total: 0, latest: null, rows: [] });
  });
});

describe("explore", () => {
  test("lists only shared projects with first names, supported products and row counts", async () => {
    expect(await listShared()).toEqual([]);
    const { project } = await seedProject();
    const hidden = await seedProject();
    await db.update(projects).set({ shareSlug: "pier-watch", sharedAt: new Date() }).where(eqId(project.id));
    await db.insert(projectProducts).values([{ projectId: project.id, productId: "people-count" }, { projectId: project.id, productId: "not-a-product" }]);
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date() });
    await recordObservation({ projectId: hidden.project.id, type: "people_count", eventTime: new Date() });

    const [card] = await listShared();
    expect(card).toMatchObject({ slug: "pier-watch", owner: "Test", products: ["People count"], rows: 1 });
    expect(JSON.stringify(card)).not.toContain("@");

    const shared = await getShared("pier-watch");
    expect(shared?.owner).toBe("Test");
    expect(shared?.products.map((p) => p.id)).toEqual(["people-count"]);
    expect(await getShared("nope")).toBeNull();
  });

  test("an owner with a blank name shows as Someone, and a project with no products or rows still lists", async () => {
    const { user, project } = await seedProject();
    await db.update(users).set({ name: "   " }).where(eq(users.id, user.id));
    await db.update(projects).set({ shareSlug: "blank", sharedAt: new Date() }).where(eqId(project.id));
    const [card] = await listShared();
    expect(card).toMatchObject({ owner: "Someone", products: [], rows: 0 });
  });
});

const eqId = (id: string) => eq(projects.id, id);
