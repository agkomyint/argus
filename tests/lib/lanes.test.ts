import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { laneProducts, observations, projectProducts, sourceLanes, sources, timelines, traces, uploads } from "@/db/schema";
import { suggestOneLane } from "@/lib/agents/orchestrator";
import { createLane, linkProduct, removeLane, setLaneFeeds, unlinkProduct } from "@/lib/lane-links";
import { loadProductData } from "@/lib/product-data";
import { laneProblems } from "@/lib/setup-rules";
import { withTrace } from "@/lib/trace";
import { getProduct } from "@/products";
import { reset, seedProject } from "../db";
import { scriptModel } from "../fakes";

beforeEach(reset);

async function project(productIds: string[]) {
  const s = await seedProject();
  if (productIds.length) await db.insert(projectProducts).values(productIds.map((productId) => ({ projectId: s.project.id, productId })));
  return s;
}

const linksOf = async (laneId: string) => (await db.select().from(laneProducts).where(eq(laneProducts.laneId, laneId))).map((r) => r.productId).sort();

describe("lane links", () => {
  test("a new lane with no feeds given feeds every product on that can read it", async () => {
    const { project: p } = await project(["body-progress", "checkin-streak", "object-detection-dataset"]);
    const { lane, feeds } = await createLane(p.id, { name: "Front photo", analyzer: "body" });
    expect(feeds.sort()).toEqual(["body-progress", "checkin-streak"]);
    expect(await linksOf(lane.id)).toEqual(["body-progress", "checkin-streak"]);
    // The hidden timeline is made once and reused.
    await createLane(p.id, { name: "Side photo", analyzer: "body" });
    expect(await db.select().from(timelines).where(eq(timelines.projectId, p.id))).toHaveLength(1);
  });

  test("feeds that are off or cannot read the lane are dropped", async () => {
    const { project: p } = await project(["body-progress", "object-detection-dataset"]);
    const { lane } = await createLane(p.id, { name: "Front photo", analyzer: "body", feeds: [] });
    expect(await setLaneFeeds(p.id, lane.id, { analyzer: "body" }, ["body-progress", "object-detection-dataset", "checkin-streak"])).toEqual(["body-progress"]);
  });

  test("turning a product on links the lanes that can feed it, turning it off unlinks them", async () => {
    const { project: p } = await project(["object-detection-dataset"]);
    const { lane: body } = await createLane(p.id, { name: "Front photo", analyzer: "body" });
    const { lane: cam } = await createLane(p.id, { name: "Street cam", analyzer: "objects" });
    await db.insert(projectProducts).values({ projectId: p.id, productId: "body-progress" });
    expect(await linkProduct(p.id, "body-progress")).toBe(1);
    expect(await linksOf(body.id)).toEqual(["body-progress"]);
    expect(await linksOf(cam.id)).toEqual(["object-detection-dataset"]);
    await unlinkProduct(p.id, "body-progress");
    expect(await linksOf(body.id)).toEqual([]);
  });

  test("a linked product leaves out files from lanes that do not feed it", async () => {
    const { project: p, user } = await project(["object-detection-dataset"]);
    const { lane: a } = await createLane(p.id, { name: "Street cam", analyzer: "objects" });
    const { lane: b } = await createLane(p.id, { name: "Back yard", analyzer: "objects", feeds: [] });
    const up = async (laneId: string | null) => (await db.insert(uploads).values({ projectId: p.id, userId: user.id, key: `k/${laneId}`, filename: "a.jpg", contentType: "image/jpeg", size: 1, status: "ready", laneId }).returning())[0];
    const [ua, ub, old] = [await up(a.id), await up(b.id), await up(null)];
    const row = (uploadId: string | null, label: string) => ({ projectId: p.id, uploadId, type: "object_detected", eventTime: new Date(), payload: { label } });
    await db.insert(observations).values([row(ua.id, "car"), row(ub.id, "cat"), row(null, "bus"), row(old.id, "van")]);

    const product = getProduct("object-detection-dataset")!;
    const labels = async () => (await loadProductData(p.id, product)).flatMap((d) => d.rows.map((r) => (r.payload as { label: string }).label)).sort();
    // "van" came from a file uploaded before lanes, which has no lane to be left out of.
    expect(await labels()).toEqual(["bus", "car", "van"]);
    // With no links at all, a product reads the whole project, as before lanes had links.
    await unlinkProduct(p.id, "object-detection-dataset");
    expect(await labels()).toEqual(["bus", "car", "cat", "van"]);
  });
});

describe("live lanes", () => {
  test("a live lane makes its source, feeds what reads that input, and takes the source with it when removed", async () => {
    const { project: p } = await project(["people-count", "object-detection-dataset"]);
    const { lane, source, feeds } = await createLane(p.id, { name: "Front desk", input: "screen", analyzer: "objects" });
    expect(source).toMatchObject({ kind: "screen", name: "Front desk", projectId: p.id });
    expect(lane.sourceId).toBe(source!.id);
    expect(feeds).toEqual(["people-count"]);
    const { source: none } = await createLane(p.id, { name: "Cam files", analyzer: "objects" });
    expect(none).toBeUndefined();

    await removeLane(p.id, lane.id);
    expect(await db.select().from(sources).where(eq(sources.projectId, p.id))).toHaveLength(0);
  });

  test("rows a live lane's source wrote only reach the products that lane feeds", async () => {
    const { project: p } = await project(["object-detection-dataset"]);
    await createLane(p.id, { name: "Street cam", analyzer: "objects" });
    const { source } = await createLane(p.id, { name: "Pier sensor", input: "webhook", analyzer: "objects" });
    await db.insert(observations).values([
      { projectId: p.id, sourceId: source!.id, type: "object_detected", eventTime: new Date(), payload: { label: "pushed" } },
      { projectId: p.id, type: "object_detected", eventTime: new Date(), payload: { label: "frame" } },
    ]);
    const labels = (await loadProductData(p.id, getProduct("object-detection-dataset")!)).flatMap((d) => d.rows.map((r) => (r.payload as { label: string }).label)).sort();
    expect(labels).toEqual(["frame"]);
  });

  test("code tells a live lane it cannot feed a product that does not read that input", () => {
    expect(laneProblems({ name: "Desk", note: "", input: "screen", analyzer: "objects", feeds: ["people-count"] }, ["people-count"], [])).toEqual([]);
    expect(laneProblems({ name: "Rain", note: "", input: "weather", analyzer: "objects", feeds: ["people-count"] }, ["people-count"], [])).toEqual(['"people-count" cannot read a weather feed lane.']);
  });
});

describe("new lane from plain words", () => {
  test("the model proposes, code drops feeds that cannot read the lane, both steps are traced", async () => {
    const { project: p, user } = await project(["body-progress", "object-detection-dataset"]);
    scriptModel({ name: " Front photo ", note: "A front photo each morning.", analyzer: "body", feeds: ["body-progress", "object-detection-dataset", "made-up"] });
    const r = await withTrace({ projectId: p.id, userId: user.id }, () => suggestOneLane("front pics of me", ["body-progress", "object-detection-dataset"], []));
    expect(r.lane).toEqual({ name: "Front photo", note: "A front photo each morning.", analyzer: "body", feeds: ["body-progress"] });
    expect(r.problems).toEqual([]);
    const names = (await db.select().from(traces).where(eq(traces.projectId, p.id))).map((t) => t.name).sort();
    expect(names).toEqual(["lanes.check_one", "lanes.suggest_one"]);
  });

  test("a taken name is a problem the person has to fix", () => {
    expect(laneProblems({ name: "front photo", note: "", analyzer: "body", feeds: [] }, [], ["Front photo"])).toEqual(['There is already a lane called "front photo".']);
    expect(laneProblems({ name: "Cam", note: "", analyzer: "objects", feeds: ["body-progress"] }, ["body-progress"], [])[0]).toContain("needs a body lane");
  });
});

test("the backfill pairs every analyzer with the products that read it", async () => {
  const sql = await Bun.file("drizzle/0020_lane_links_backfill.sql").text();
  const { products } = await import("@/products");
  const { analyzerFor } = await import("@/lib/setup-rules");
  // Products added after this migration had no projects to backfill; new lanes link them as they are made.
  const later = new Set(["object-footprint"]);
  for (const p of products.filter((x) => x.status === "supported" && !later.has(x.id))) {
    const a = analyzerFor(p.id);
    if (a) expect(sql).toContain(`('${a}', '${p.id}')`);
  }
  expect(await db.select().from(sourceLanes)).toHaveLength(0);
});

test("the live-lane backfill gives every live kind a lane and links screens to what reads them", async () => {
  const sql = await Bun.file("drizzle/0021_common_old_lace.sql").text();
  expect(sql).toContain("('screen', 'weather', 'sensor_sim', 'webhook')");
  const { sourcesFor } = await import("@/lib/product-sources");
  const { products } = await import("@/products");
  for (const p of products.filter((x) => sourcesFor(x.id).some((n) => n.kind === "screen"))) expect(sql).toContain(`'${p.id}'`);
});
