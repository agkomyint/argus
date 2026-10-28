import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, sourceLanes, traces, uploads } from "@/db/schema";
import { lanesFeeds } from "@/lib/lane-links";
import type { StudioTimeline, TlItem, TlLane, TlStep } from "@/lib/studio-timeline-types";

const LIMIT = 4000;
const ROWS_PER_ITEM = 300;
const MINUTE = 60_000;
// Lanes that are not real rows: files from before lanes, and screen frames when no screen lane exists.
const FILES = "files";
const SCREEN = "screen";

type Unit = { id: string; lane: string; kind: TlItem["kind"]; t: number; done: number; label: string; steps: TlStep[]; rows: Set<string>; jobs: string[]; pending: boolean };

const clock = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

/**
 * The studio timeline: every file, frame and live reading that came in through each lane, the recorded
 * steps that read it (from the traces), and the Observations it became. It is all joined by ids already
 * stored: a trace's job or upload, a frame's storage key, an Observation's upload or source. Nothing is guessed.
 * Public replays get no filenames and no error text, and body lanes are marked locked.
 */
export async function loadStudioTimeline(projectId: string, audience: "owner" | "public"): Promise<StudioTimeline> {
  const pub = audience === "public";
  const [lanes, files, steps, work, rows] = await Promise.all([
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, projectId)).orderBy(asc(sourceLanes.createdAt)),
    db.select({ id: uploads.id, name: uploads.filename, laneId: uploads.laneId, status: uploads.status, at: uploads.createdAt }).from(uploads)
      .where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt)).limit(LIMIT),
    db.select({
      id: traces.id, jobId: traces.jobId, uploadId: traces.uploadId, kind: traces.kind, name: traces.name, model: traces.model, status: traces.status,
      ms: traces.ms, error: traces.error, tokensIn: traces.tokensIn, tokensOut: traces.tokensOut, wrote: traces.observationIds, at: traces.createdAt,
      // Only a storage key names a frame; older SAM steps wrote the picture's size under the same name.
      frame: sql<string | null>`case when jsonb_typeof(${traces.output}->'frame') = 'string' then ${traces.output}->>'frame' end`,
    }).from(traces).where(eq(traces.projectId, projectId)).orderBy(desc(traces.createdAt)).limit(LIMIT),
    db.select({ id: jobs.id, status: jobs.status, uploadId: sql<string | null>`${jobs.payload}->>'uploadId'`, key: sql<string | null>`${jobs.payload}->>'key'`, at: jobs.createdAt, end: jobs.finishedAt })
      .from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(LIMIT),
    db.select({
      id: observations.id, sourceId: observations.sourceId, uploadId: observations.uploadId, at: observations.arrivalTime,
      frame: sql<string | null>`${observations.provenance}->>'frame'`, connector: sql<string | null>`${observations.provenance}->>'connector'`,
    }).from(observations).where(eq(observations.projectId, projectId)).orderBy(desc(observations.arrivalTime)).limit(LIMIT),
  ]);
  const feeds = await lanesFeeds(lanes.map((l) => l.id));

  const fileOf = new Map(files.map((f) => [f.id, f]));
  const laneOfSource = new Map(lanes.filter((l) => l.sourceId).map((l) => [l.sourceId!, l.id]));
  const screenLane = lanes.find((l) => l.input === "screen")?.id ?? SCREEN;
  const units = new Map<string, Unit>();
  const other: TlStep[] = [];

  // A frame key names its video's upload (…/frames/<upload>/…) or a screen capture (…/capture/…).
  const laneOfFrame = (key: string) => {
    const up = /\/frames\/([0-9a-f-]{36})\//.exec(key)?.[1];
    return up ? (fileOf.get(up)?.laneId ?? FILES) : screenLane;
  };
  const unit = (id: string, make: () => Omit<Unit, "id" | "steps" | "rows" | "jobs" | "pending" | "done">) => {
    let u = units.get(id);
    if (!u) {
      const m = make();
      u = { id, ...m, done: m.t, steps: [], rows: new Set(), jobs: [], pending: false };
      units.set(id, u);
    }
    return u;
  };
  const ofFile = (id: string, t: number) => unit(id, () => {
    const f = fileOf.get(id);
    return { lane: f?.laneId ?? FILES, kind: "file", t: f?.at.getTime() ?? t, label: f?.name ?? "A file no longer kept" };
  });
  const ofFrame = (key: string, t: number) => unit(key, () => {
    const at = /\/(\d{9})\.jpg$/.exec(key)?.[1];
    return { lane: laneOfFrame(key), kind: "frame", t, label: at ? `Frame at ${clock(Number(at))}` : "Screen frame" };
  });
  const ofMinute = (lane: string, t: number) => {
    const m = Math.floor(t / MINUTE) * MINUTE;
    return unit(`${lane}:${m}`, () => ({ lane, kind: "reading", t: m, label: `Readings ${hhmm(m)}` }));
  };

  for (const f of files) {
    const u = ofFile(f.id, f.at.getTime());
    if (f.status === "pending") u.pending = true;
  }
  const jobUnit = new Map<string, Unit>();
  for (const j of work) {
    const t = j.at.getTime();
    const u = j.key ? ofFrame(j.key, t) : j.uploadId ? ofFile(j.uploadId, t) : null;
    if (!u) continue;
    jobUnit.set(j.id, u);
    u.jobs.push(j.status);
    u.t = Math.min(u.t, t);
    if (j.end) u.done = Math.max(u.done, j.end.getTime());
  }
  const byRow = new Map<string, Unit>();
  for (const s of [...steps].reverse()) {
    const t = s.at.getTime();
    const step: TlStep = {
      id: s.id, t, kind: s.kind, name: s.name, model: s.model, ms: s.ms, ok: s.status === "ok",
      tokens: s.tokensIn === null && s.tokensOut === null ? null : (s.tokensIn ?? 0) + (s.tokensOut ?? 0),
      wrote: s.wrote.length, ...(pub || !s.error ? {} : { error: s.error.slice(0, 160) }),
    };
    const u = s.frame ? ofFrame(s.frame, t) : (s.jobId && jobUnit.get(s.jobId)) || (s.uploadId ? ofFile(s.uploadId, t) : null);
    if (!u) { other.push(step); continue; }
    u.steps.push(step);
    u.t = Math.min(u.t, t);
    u.done = Math.max(u.done, t);
    for (const id of s.wrote) { u.rows.add(id); byRow.set(id, u); }
  }
  for (const o of rows) {
    const t = o.at.getTime();
    const u = byRow.get(o.id)
      ?? (o.frame ? ofFrame(o.frame, t)
        : o.uploadId ? ofFile(o.uploadId, t)
          : o.sourceId && laneOfSource.has(o.sourceId) ? ofMinute(laneOfSource.get(o.sourceId)!, t)
            : o.connector === "screen-share" ? ofMinute(screenLane, t) : null);
    if (!u) continue;
    u.rows.add(o.id);
    u.done = Math.max(u.done, t);
  }

  const items = new Map<string, TlItem[]>();
  for (const u of units.values()) {
    const busy = u.jobs.some((s) => s === "running");
    const waiting = u.pending || u.jobs.some((s) => s === "queued");
    const failed = !u.rows.size && (u.jobs.includes("failed") || u.steps.some((s) => !s.ok));
    const state: TlItem["state"] = busy ? "reading" : waiting ? "waiting" : failed ? "failed" : "done";
    const list = items.get(u.lane) ?? [];
    list.push({ id: u.id, kind: u.kind, t: u.t, done: u.done, state, label: u.label, steps: u.steps, rows: [...u.rows].slice(0, ROWS_PER_ITEM) });
    items.set(u.lane, list);
  }

  const out: TlLane[] = lanes.map((l) => ({ id: l.id, name: l.name, input: l.input, analyzer: l.analyzer, feeds: feeds.get(l.id) ?? [], items: items.get(l.id) ?? [], ...(pub && l.analyzer === "body" ? { locked: true } : {}) }));
  const early = items.get(FILES);
  if (early?.length) {
    // Files from before lanes have no analyzer of their own; body check-ins show by the steps that read them.
    const body = early.some((i) => i.steps.some((s) => s.name.startsWith("body.")));
    out.push({ id: FILES, name: "Earlier files", input: "files", analyzer: body ? "body" : "objects", feeds: [], items: early, ...(pub && body ? { locked: true } : {}) });
  }
  if (screenLane === SCREEN && items.get(SCREEN)?.length) out.push({ id: SCREEN, name: "Screen share", input: "screen", analyzer: "screen", feeds: [], items: items.get(SCREEN)! });

  for (const l of out) {
    l.items.sort((a, b) => a.t - b.t);
    if (pub) {
      let n = 0;
      for (const it of l.items) if (it.kind === "file") it.label = l.analyzer === "body" ? `Check-in ${++n}` : `File ${++n}`;
    }
  }
  return { lanes: out, other };
}
