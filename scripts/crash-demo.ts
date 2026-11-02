// Builds the "Highway Crash: Footage Analysis" showcase project from one news clip. Run:
//   bun --conditions react-server scripts/crash-demo.ts <email> <media-dir> [--share]
// <media-dir> holds crash.mp4, crash.wav (mono 16 kHz) and frames/*.jpg (one every 2 s).
// Uses real models (spends credits).
import { and, eq, sql } from "drizzle-orm";
import { plugin } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Outside a request there is no after(); the script drains the queue itself.
plugin({ name: "no-after", setup(b) { b.module("next/server", () => ({ exports: { after: () => {} }, loader: "object" })); } });

const { db } = await import("../src/db");
const { projects, uploads, user } = await import("../src/db/schema");
const { createProject } = await import("../src/lib/ops");
const { createLane } = await import("../src/lib/lane-links");
const { s3 } = await import("../src/lib/s3");
const { enqueue, drainJobs } = await import("../src/lib/jobs");
const { tlKey } = await import("../src/lib/source-key");
const { storeVideoFrame } = await import("../src/sources/video");
const { withTrace, writeTrace } = await import("../src/lib/trace");
const { safeName } = await import("../src/lib/uploads");

const [email, dir] = [process.argv[2], process.argv[3]];
const share = process.argv.includes("--share");
if (!email || !dir) throw new Error("usage: crash-demo.ts <email> <media-dir> [--share]");
const [u] = await db.select().from(user).where(eq(user.email, email));
if (!u) throw new Error("no such user");
const NAME = "Highway Crash: Footage Analysis";
const [dup] = await db.select().from(projects).where(and(eq(projects.userId, u.id), eq(projects.name, NAME)));
if (dup) throw new Error(`${NAME} already exists (${dup.id})`);

const project = await createProject(u.id, NAME, [
  "shot-timeline", "incident-timeline", "on-screen-text", "emergency-response", "claims-vs-evidence",
  "speech-log", "object-detection-dataset", "vehicle-traffic-dashboard", "density-heatmap",
]);
await db.update(projects).set({ description: "One news clip, read by Meta models: shots, incidents, on-screen text, responders, speech, and what was said set against what the footage shows." }).where(eq(projects.id, project.id));
console.log("project", project.id);

const lane = (name: string, note: string, analyzer: "objects" | "speech") => createLane(project.id, { name, note, input: "files", analyzer });
const video = (await lane("News clip: video", "Local news report on a highway crash", "objects")).lane;
const audio = (await lane("News clip: audio", "The reporter and anchor speech from the same clip", "speech")).lane;
console.log("lanes ok");

async function addUpload(l: typeof video, path: string, filename: string, contentType: string) {
  const id = crypto.randomUUID();
  const key = `${project.id}/${id}/${safeName(filename)}`;
  const file = Bun.file(path);
  await s3.write(key, file, { type: contentType });
  const [up] = await db.insert(uploads).values({ id, projectId: project.id, userId: u.id, key, filename, contentType, size: file.size, timelineId: l.timelineId, laneId: l.id, status: "ready" }).returning();
  await enqueue(project.id, "process_upload", { uploadId: up.id }, { drain: false, source: tlKey(l.timelineId) });
  return up;
}

const up = await addUpload(video, join(dir, "crash.mp4"), "crash.mp4", "video/mp4");
const frames = readdirSync(join(dir, "frames")).filter((f) => f.endsWith(".jpg")).sort();
const t0 = Date.now();
await withTrace({ projectId: project.id, userId: u.id, uploadId: up.id }, async () => {
  for (const [i, f] of frames.entries()) await storeVideoFrame(up, i * 2000, new Uint8Array(await Bun.file(join(dir, "frames", f)).arrayBuffer()), frames.length);
  await writeTrace({ kind: "code", name: "video.sample_frames", status: "ok", ms: Date.now() - t0, input: { file: "crash.mp4", everyMs: 2000, decoder: "ffmpeg (script)" }, output: { frames: frames.length, ranIn: "the demo script" } });
});
console.log("video", frames.length, "frames");
await addUpload(audio, join(dir, "crash.wav"), "crash.wav", "audio/wav");

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
