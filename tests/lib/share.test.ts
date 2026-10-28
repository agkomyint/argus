import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { observations, projects, uploads } from "@/db/schema";
import { createLane } from "@/lib/lane-links";
import { listShared, loadOwnerView, loadShareView, projectMediaKey, sharedMediaKey, sharedTag } from "@/lib/explore";
import { reset, seedProject } from "../db";

beforeEach(reset);

const T0 = new Date("2026-05-01T10:00:00Z").getTime();
const at = (s: number) => new Date(T0 + s * 1000);

async function shared(media: boolean) {
  const s = await seedProject();
  const projectId = s.project.id;
  await db.update(projects).set({ shareSlug: "harbor", sharedAt: new Date(), shareMedia: media }).where(eq(projects.id, projectId));
  const { lane: body } = await createLane(projectId, { name: "Front pics", analyzer: "body" });
  const { lane: site } = await createLane(projectId, { name: "Site", analyzer: "objects" });
  let k = 0;
  const upload = async (filename: string, over: Partial<typeof uploads.$inferInsert> = {}) =>
    (await db.insert(uploads).values({ projectId, userId: s.user.id, key: `${projectId}/k${k++}`, filename, contentType: "image/jpeg", size: 1, status: "ready", ...over }).returning())[0];
  const photo = await upload("bridge.jpg", { laneId: site.id, timelineId: site.timelineId, createdAt: at(1) });
  const me = await upload("me.jpg", { laneId: body.id, createdAt: at(2) });
  const clip = await upload("walk.mp4", { contentType: "video/mp4", createdAt: at(3) });
  await upload("notes.txt", { createdAt: at(4) });
  const obs = (type: string, payload: Record<string, unknown>, over: Partial<typeof observations.$inferInsert> = {}) =>
    db.insert(observations).values({ projectId, type, eventTime: at(5), payload, ...over }).returning().then((r) => r[0]);
  await obs("object_detected", { label: "truck", description: "a red truck", file: "bridge.jpg", upload_id: photo.id }, { uploadId: photo.id, confidence: 0.9, provenance: { producer: "llama-4" } });
  await obs("object_detected", { object_class: "car" }, { uploadId: photo.id });
  await obs("body_view", { lane: "Front", day: "2026-05-01", summary: "steady", upload_id: me.id, file: "me.jpg" }, { uploadId: me.id });
  const key = `${projectId}/frames/${clip.id}/000010000.jpg`;
  const frame = await obs("video_frame", { upload_id: clip.id, at: "00:10" }, { provenance: { frame: key } });
  await obs("people_count", { count: 3, upload_id: clip.id, at: "00:10" }, { provenance: { frame: key } });
  await obs("attribute_breakdown", { female: 1, male: 2 }, { provenance: { frame: key } });
  const screen = await obs("persona_view", { persona: "newcomer", clarity: 6, quote: "Hmm" }, { provenance: { frame: `${projectId}/capture/a.jpg`, connector: "screen-share" } });
  await obs("persona_friction", { issue: "tiny text" }, { provenance: { frame: `${projectId}/capture/a.jpg` } });
  await obs("persona_view", { persona_name: "Skeptic" });
  return { ...s, projectId, photo, me, clip, frame, screen };
}

describe("share view", () => {
  test("with media: photos, videos and frames with their findings; body photos and their ids stay out", async () => {
    const s = await shared(true);
    const v = await loadShareView(s.projectId, "harbor", true);
    const names = v.media!.map((m) => m.name);
    expect(names).toContain("bridge.jpg");
    expect(names).toContain("walk.mp4");
    expect(names).toContain("walk.mp4 · 00:10");
    expect(names).toContain("Screen frame");
    expect(names).not.toContain("me.jpg");
    expect(names).not.toContain("notes.txt");
    expect(v.media!.every((m) => m.src.startsWith("/api/explore/harbor/media/"))).toBe(true);

    const photo = v.media!.find((m) => m.name === "bridge.jpg")!;
    expect(photo).toMatchObject({ kind: "image", source: `tl:${(await db.select().from(uploads).where(eq(uploads.id, s.photo.id)))[0].timelineId}` });
    expect(photo.findings.map((f) => f.label).sort()).toEqual(["car", "truck"]);
    expect(v.media!.find((m) => m.name === "walk.mp4")).toMatchObject({ kind: "video", source: "files" });
    const fr = v.media!.find((m) => m.kind === "frame" && m.name.startsWith("walk"))!;
    expect(fr.source).toBe("files");
    expect(fr.findings.map((f) => f.label).sort()).toEqual(["1 female · 2 male · 0 unclear", "3 people"]);
    const scr = v.media!.find((m) => m.name === "Screen frame")!;
    expect(scr.source).toBe("screen");
    expect(scr.findings.map((f) => f.label).sort()).toEqual(["Friction", "newcomer · clarity 6/10"]);

    expect(v.producers["l:object_detected"]).toBeDefined();
    expect(v.samples["l:body_view"][0].payload).toEqual({ lane: "Front", day: "2026-05-01", summary: "steady" });
    expect(v.samples["l:object_detected"].some((x) => "upload_id" in x.payload)).toBe(true);
  });

  test("without media: no media at all and no fields that point at files", async () => {
    const s = await shared(false);
    const v = await loadShareView(s.projectId, "harbor", false);
    expect(v.media).toBeNull();
    for (const list of Object.values(v.samples)) for (const x of list) expect(Object.keys(x.payload)).not.toContainEqual("upload_id");
  });

  test("the owner sees everything, body photos too, through the owner route", async () => {
    const s = await shared(false);
    const v = await loadOwnerView(s.projectId);
    const body = v.media!.find((m) => m.name === "me.jpg")!;
    expect(body.src).toBe(`/api/studio/${s.projectId}/media/${s.me.id}`);
    expect(body.findings[0]).toMatchObject({ type: "body_view", label: "Front · 2026-05-01", detail: "steady" });
    expect(v.samples["l:body_view"][0].payload.upload_id).toBe(s.me.id);
  });

  test("media keys: only with shared media, never for body photos, and frames by their Observation", async () => {
    const s = await shared(true);
    expect(await sharedMediaKey("harbor", s.photo.id)).toBe(`${s.projectId}/k0`);
    expect(await sharedMediaKey("harbor", s.me.id)).toBeNull();
    expect(await sharedMediaKey("harbor", s.frame.id)).toBe(`${s.projectId}/frames/${s.clip.id}/000010000.jpg`);
    expect(await sharedMediaKey("nope", s.photo.id)).toBeNull();
    expect(await projectMediaKey(s.projectId, s.me.id)).toBe(`${s.projectId}/k1`);
    const txt = (await db.select().from(uploads).where(eq(uploads.filename, "notes.txt")))[0];
    expect(await projectMediaKey(s.projectId, txt.id)).toBeNull();
    expect(await projectMediaKey(s.projectId, "00000000-0000-4000-8000-000000000000")).toBeNull();

    await db.update(projects).set({ shareMedia: false });
    expect(await sharedMediaKey("harbor", s.photo.id)).toBeNull();
  });

  test("an Explore card gets posters (never body photos) and the shape of its replay", async () => {
    await shared(true);
    const [card] = await listShared();
    expect(card.posters).toHaveLength(1);
    expect(card.posters![0]).toStartWith("/api/explore/harbor/media/");
    expect(card.activity).toHaveLength(24);
    expect(Math.max(...card.activity!)).toBe(1);
    expect(card.spanMs).toBe(0);
  });
});

describe("shared replay cache", () => {
  test("each link has its own tag", () => {
    expect(sharedTag("abc")).toBe("share:abc");
    expect(sharedTag("abc")).not.toBe(sharedTag("abd"));
  });
});
