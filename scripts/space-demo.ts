// Builds the "Artemis Launch Control" demo project from public NASA media. Run:
//   bun --conditions react-server scripts/space-demo.ts <email> <media-dir> [--share]
// Uses real models (spends credits). Media: NASA Image and Video Library (public domain unless noted).
import { and, eq, sql } from "drizzle-orm";
import { plugin } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Outside a request there is no after(); the script drains the queue itself.
plugin({ name: "no-after", setup(b) { b.module("next/server", () => ({ exports: { after: () => {} }, loader: "object" })); } });

const { db } = await import("../src/db");
const { consumerApps, jobs, projects, uploads, user } = await import("../src/db/schema");
const { createProject } = await import("../src/lib/ops");
const { createLane } = await import("../src/lib/lane-links");
const { s3 } = await import("../src/lib/s3");
const { enqueue, drainJobs } = await import("../src/lib/jobs");
const { tlKey, srcKey } = await import("../src/lib/source-key");
const { storeVideoFrame } = await import("../src/sources/video");
const { withTrace, writeTrace } = await import("../src/lib/trace");
const { safeName } = await import("../src/lib/uploads");

const [email, dir] = [process.argv[2], process.argv[3]];
const share = process.argv.includes("--share");
if (!email || !dir) throw new Error("usage: space-demo.ts <email> <media-dir> [--share]");
const [u] = await db.select().from(user).where(eq(user.email, email));
if (!u) throw new Error("no such user");
const NAME = "Artemis Launch Control";
const [dup] = await db.select().from(projects).where(and(eq(projects.userId, u.id), eq(projects.name, NAME)));
if (dup) throw new Error(`${NAME} already exists (${dup.id})`);

const project = await createProject(u.id, NAME, ["people-count", "object-detection-dataset", "object-footprint", "speech-log"]);
await db.update(projects).set({ description: "NASA public media across five lanes: two control-room videos, a mission podcast, launch photos and live launch-site weather. A Watcher app alerts when the room fills." }).where(eq(projects.id, project.id));
console.log("project", project.id);

const lane = (name: string, note: string, input: "files" | "weather", analyzer: "objects" | "speech", config?: Record<string, unknown>) =>
  createLane(project.id, { name, note, input, analyzer, config });
const lcc = (await lane("Launch control: simulation", "Artemis II launch simulation in the Launch Control Center (NASA KSC)", "files", "objects")).lane;
const wdr = (await lane("Launch control: wet dress", "Artemis II wet dress rehearsal, control room (NASA KSC)", "files", "objects")).lane;
const pod = (await lane("Mission audio", "NASA 'Houston We Have a Podcast': Artemis II Recovery", "files", "speech")).lane;
const pics = (await lane("Launch photos", "NASA photos of the ISS, Artemis rollout and Orion", "files", "objects")).lane;
const wx = await lane("Launch-site weather", "Open-Meteo at Kennedy Space Center, Florida", "weather", "objects", { lat: 28.5729, lng: -80.649 });
console.log("lanes ok");

async function addUpload(l: typeof lcc, path: string, filename: string, contentType: string) {
  const id = crypto.randomUUID();
  const key = `${project.id}/${id}/${safeName(filename)}`;
  const file = Bun.file(path);
  await s3.write(key, file, { type: contentType });
  const [up] = await db.insert(uploads).values({ id, projectId: project.id, userId: u.id, key, filename, contentType, size: file.size, timelineId: l.timelineId, laneId: l.id, status: "ready" }).returning();
  await enqueue(project.id, "process_upload", { uploadId: up.id }, { drain: false, source: tlKey(l.timelineId) });
  return up;
}

for (const [l, file, folder] of [[lcc, "lcc120.mp4", "frames_lcc"], [wdr, "wdr120.mp4", "frames_wdr"]] as const) {
  const up = await addUpload(l, join(dir, file), file, "video/mp4");
  const frames = readdirSync(join(dir, folder)).filter((f) => f.endsWith(".jpg")).sort();
  const t0 = Date.now();
  await withTrace({ projectId: project.id, userId: u.id, uploadId: up.id }, async () => {
    for (const [i, f] of frames.entries()) await storeVideoFrame(up, i * 6000, new Uint8Array(await Bun.file(join(dir, folder, f)).arrayBuffer()), frames.length);
    await writeTrace({ kind: "code", name: "video.sample_frames", status: "ok", ms: Date.now() - t0, input: { file, durationMs: 120000, everyMs: 6000, decoder: "ffmpeg (script)" }, output: { frames: frames.length, ranIn: "the demo script" } });
  });
  console.log("video", file, frames.length, "frames");
}
await addUpload(pod, join(dir, "recovery.wav"), "artemis-ii-recovery.wav", "audio/wav");
for (const f of readdirSync(join(dir, "img")).sort()) await addUpload(pics, join(dir, "img", f), f, "image/jpeg");
await enqueue(project.id, "poll_source", { sourceId: wx.source!.id }, { drain: false, source: srcKey(wx.source!.id) });

await db.insert(consumerApps).values({ projectId: project.id, name: "Control room crowded", kind: "watcher", reads: ["people-count"], rule: { dials: { "people-count": 3 }, severity: "medium", cooldownMin: 0, browserAlert: true }, on: true, onTimeline: true });

// Drain until nothing is waiting.
for (let i = 0; i < 200; i++) {
  await drainJobs(50);
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from jobs where project_id = ${project.id} and status in ('queued','running')`);
  console.log("pending", n);
  if (!n) break;
  await Bun.sleep(3000);
}
const stat = await db.execute<{ status: string; kind: string; n: number }>(sql`select status, kind, count(*)::int as n from jobs where project_id = ${project.id} group by 1,2 order by 2`);
console.table(stat);

if (share) {
  const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await db.update(projects).set({ shareSlug: slug, sharedAt: new Date(), shareMedia: false }).where(eq(projects.id, project.id));
  console.log("shared slug", slug);
}
console.log("done", project.id);
process.exit(0);
