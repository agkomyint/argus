import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, projectProducts, sourceLanes, sources, uploads } from "@/db/schema";
import { createLaneIn, deleteLaneIn, setLaneFeedsIn, suggestLaneFor } from "@/app/lane-actions";
import { LaneBoard, type LaneData, type LaneFile } from "@/components/studio/lane-board";
import { LiveLaneSetup } from "@/components/studio/live-lane-setup";
import { AutoRefresh } from "@/components/workspace/pipeline-controls";
import { loadSources } from "@/lib/engine";
import { lanesFeeds } from "@/lib/lane-links";
import { liveReady } from "@/lib/setup-rules";
import { srcKey } from "@/lib/source-key";
import { getProduct } from "@/products";

/** Each live lane's setup (capture, place, asset, webhook), to open in place on its card in the studio. */
export async function laneSetups(projectId: string, agentLevel: number, frequency?: number): Promise<Record<string, React.ReactNode>> {
  const [lanes, live, status] = await Promise.all([
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, projectId)),
    db.select().from(sources).where(eq(sources.projectId, projectId)),
    loadSources(projectId),
  ]);
  return Object.fromEntries(lanes.flatMap((l) => {
    const s = live.find((x) => x.id === l.sourceId);
    if (!s) return [];
    const st = status.find((x) => x.key === (s.kind === "screen" ? "screen" : srcKey(s.id)));
    return [[l.id, <LiveLaneSetup key={l.id} projectId={projectId} source={s} status={st} agentLevel={agentLevel} frequency={frequency} />]];
  }));
}

/**
 * Loads the project's lanes, their files and what each file has become, for the Lanes window. A file is
 * "read" once it wrote Observations or its jobs finished; it is "reading" while a job for it is queued
 * or running. A live lane shows its setup (capture, place, asset, webhook) in place of the files. The window
 * refreshes itself while anything is still reading.
 */
export async function LaneManager({ projectId, agentLevel, frequency }: { projectId: string; agentLevel: number; frequency?: number }) {
  const [lanes, files, on, live, status] = await Promise.all([
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, projectId)).orderBy(sourceLanes.createdAt),
    db.select().from(uploads).where(and(eq(uploads.projectId, projectId), sql`${uploads.laneId} is not null`)).orderBy(desc(uploads.createdAt)),
    db.select({ id: projectProducts.productId }).from(projectProducts).where(eq(projectProducts.projectId, projectId)),
    db.select().from(sources).where(eq(sources.projectId, projectId)),
    loadSources(projectId),
  ]);
  const sourceOf = (l: (typeof lanes)[number]) => live.find((s) => s.id === l.sourceId);
  const statusOf = (s: (typeof live)[number]) => status.find((x) => x.key === (s.kind === "screen" ? "screen" : srcKey(s.id)));
  const ids = files.map((f) => f.id);
  const uid = sql<string>`${jobs.payload}->>'uploadId'`;
  const [feeds, rows, work] = await Promise.all([
    lanesFeeds(lanes.map((l) => l.id)),
    ids.length ? db.select({ id: observations.uploadId, n: count() }).from(observations).where(inArray(observations.uploadId, ids)).groupBy(observations.uploadId) : [],
    ids.length ? db.select({ id: uid, status: jobs.status }).from(jobs).where(and(eq(jobs.projectId, projectId), inArray(uid, ids))) : [],
  ]);

  const readOf = (f: (typeof files)[number], n: number): LaneFile["read"] => {
    const mine = work.filter((w) => w.id === f.id).map((w) => w.status);
    if (mine.some((s) => s === "queued" || s === "running")) return "working";
    if (n > 0 || mine.includes("done")) return "done";
    if (mine.includes("failed")) return "failed";
    return "waiting";
  };
  const data: LaneData[] = lanes.map((l) => ({
    id: l.id,
    name: l.name,
    note: l.note,
    analyzer: l.analyzer,
    input: l.input,
    ready: sourceOf(l) ? liveReady(sourceOf(l)!) : undefined,
    feeds: feeds.get(l.id) ?? [],
    files: files.filter((f) => f.laneId === l.id).map((f) => {
      const n = rows.find((r) => r.id === f.id)?.n ?? 0;
      return { id: f.id, filename: f.filename, size: f.size, status: f.status, createdAt: f.createdAt.toISOString(), takenOn: f.takenOn, read: readOf(f, n), rows: n };
    }),
  }));
  const products = on.map((p) => getProduct(p.id)).filter((p) => p?.status === "supported").map((p) => ({ id: p!.id, name: p!.name }));

  return (
    <>
      <AutoRefresh active={data.some((l) => l.files.some((f) => f.read === "working")) || status.some((s) => s.state === "working" && s.type !== "files")} everyMs={3000} />
      <LaneBoard
        projectId={projectId}
        lanes={data}
        products={products}
        setup={Object.fromEntries(lanes.flatMap((l) => {
          const s = sourceOf(l);
          return s ? [[l.id, <LiveLaneSetup key={l.id} projectId={projectId} source={s} status={statusOf(s)} agentLevel={agentLevel} frequency={frequency} />]] : [];
        }))}
        actions={{
          suggest: suggestLaneFor.bind(null, projectId),
          create: createLaneIn.bind(null, projectId),
          setFeeds: setLaneFeedsIn.bind(null, projectId),
          remove: deleteLaneIn.bind(null, projectId),
        }}
      />
    </>
  );
}
