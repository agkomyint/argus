import "server-only";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations, projectProducts, projects, sourceLanes, uploads, user } from "@/db/schema";
import type { ShareFinding, ShareMedia, SharePlace, ShareProducer, ShareSample, ShareView } from "@/lib/share-types";
import { tlKey } from "@/lib/source-key";
import type { Dataset } from "@/lib/product-types";
import { extensionOf } from "@/lib/uploads";
import { getProduct } from "@/products";

/**
 * Projects their owners chose to show on /explore. Only what the share dialog promises leaves here:
 * the project name, its products and their rows, and the replay. Never email, files, frames or keys.
 */
const sharedCols = { id: projects.id, slug: projects.shareSlug, name: projects.name, kind: projects.kind, agentLevel: projects.agentLevel, frequency: projects.frequency, createdAt: projects.createdAt, sharedAt: projects.sharedAt, shareMedia: projects.shareMedia, owner: user.name };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";

export async function productsOf(ids: string[]) {
  if (!ids.length) return new Map<string, NonNullable<ReturnType<typeof getProduct>>[]>();
  const rows = await db.select().from(projectProducts).where(inArray(projectProducts.projectId, ids)).orderBy(projectProducts.enabledAt);
  const out = new Map<string, NonNullable<ReturnType<typeof getProduct>>[]>();
  for (const r of rows) {
    const p = getProduct(r.productId);
    if (p?.status === "supported") out.set(r.projectId, [...(out.get(r.projectId) ?? []), p]);
  }
  return out;
}

/** A shared project as a card: what it makes, plus a poster and the shape of its replay so people want to press play. */
export type SharedProject = {
  slug: string;
  name: string;
  kind: string;
  owner: string;
  sharedAt: Date;
  products: string[];
  rows: number;
  /** Up to four shared pictures for the poster, only when the owner shares media. Body check-ins never. */
  posters?: string[];
  /** When rows arrived across the replay, 0..1 in 24 equal slices. */
  activity?: number[];
  /** First to last row, in ms. */
  spanMs?: number;
};

const BINS = 24;

export async function listShared(limit = 48): Promise<SharedProject[]> {
  const rows = await db.select(sharedCols).from(projects).innerJoin(user, eq(user.id, projects.userId)).where(isNotNull(projects.sharedAt)).orderBy(desc(projects.sharedAt)).limit(limit);
  const ids = rows.map((r) => r.id);
  const withMedia = rows.filter((r) => r.shareMedia).map((r) => r.id);
  const [prods, counts, bins, pics] = await Promise.all([
    productsOf(ids),
    ids.length ? db.select({ id: observations.projectId, n: sql<number>`count(*)::int` }).from(observations).where(inArray(observations.projectId, ids)).groupBy(observations.projectId) : [],
    ids.length
      ? db.execute<{ id: string; k: number; n: number; span: number }>(sql`
          with b as (select project_id, min(event_time) lo, max(event_time) hi from observations where project_id in ${sql.raw(`(${ids.map((i) => `'${i}'`).join(",")})`)} group by 1)
          select o.project_id as id, least(width_bucket(extract(epoch from o.event_time), extract(epoch from b.lo), extract(epoch from b.hi) + 0.001, ${BINS}), ${BINS})::int as k,
                 count(*)::int as n, (extract(epoch from (b.hi - b.lo)) * 1000)::float8 as span
          from observations o join b using (project_id) group by 1, 2, 4`)
      : [],
    withMedia.length
      ? db.execute<{ id: string; pid: string }>(sql`
          select u.id, u.project_id as pid from uploads u left join source_lanes l on l.id = u.lane_id
          where u.project_id in ${sql.raw(`(${withMedia.map((i) => `'${i}'`).join(",")})`)} and u.status = 'ready'
            and lower(u.filename) ~ '[.](jpe?g|png|webp)$' and coalesce(l.analyzer, 'objects') <> 'body'
          order by u.created_at`)
      : [],
  ]);
  return rows.map((r) => {
    const mine = bins.filter((b) => b.id === r.id);
    const hist = Array.from({ length: BINS }, (_, i) => mine.find((b) => b.k === i + 1)?.n ?? 0);
    const top = Math.max(...hist, 1);
    return {
      slug: r.slug!,
      name: r.name,
      kind: r.kind,
      owner: firstName(r.owner),
      sharedAt: r.sharedAt!,
      products: (prods.get(r.id) ?? []).map((p) => p.name),
      rows: counts.find((c) => c.id === r.id)?.n ?? 0,
      posters: pics.filter((m) => m.pid === r.id).slice(0, 4).map((m) => `/api/explore/${r.slug}/media/${m.id}`),
      activity: mine.length ? hist.map((n) => n / top) : [],
      spanMs: mine[0]?.span ?? 0,
    };
  });
}

const MEDIA_LIMIT = 160;
const IMAGE = new Set(["jpg", "jpeg", "png", "webp"]);
const VIDEO = new Set(["mp4", "mov", "webm"]);
// Fields that point back at private files; dropped from samples unless media is shared.
const PRIVATE_FIELDS = ["file", "upload_id", "session"];

const findingOf = (type: string, payload: Record<string, unknown>, confidence: number | null): ShareFinding => {
  if (type === "people_count") return { type, label: `${Number(payload.count ?? 0)} people`, confidence };
  if (type === "persona_view") return { type, label: `${String(payload.persona_name ?? payload.persona ?? "Visitor")} · clarity ${Number(payload.clarity ?? 0)}/10`, confidence: null, detail: typeof payload.quote === "string" ? payload.quote : undefined };
  if (type === "persona_friction") return { type, label: String(payload.label ?? "Friction"), confidence: null, detail: typeof payload.issue === "string" ? payload.issue : undefined };
  if (type === "body_view") return { type, label: `${String(payload.lane ?? "Check-in")} · ${String(payload.day ?? "")}`, confidence: null, detail: typeof payload.summary === "string" ? payload.summary : undefined };
  if (type === "attribute_breakdown") return { type, label: `${payload.female ?? 0} female · ${payload.male ?? 0} male · ${payload.unclear ?? 0} unclear`, confidence, detail: "Apparent, estimated from the frame" };
  if (type === "object_mask") return { type, label: String(payload.label ?? "object"), confidence, ...placeOf(payload) };
  return { type, label: String(payload.label ?? payload.object_class ?? type), confidence, detail: typeof payload.description === "string" ? payload.description : undefined };
};

const nums = (v: unknown, n: number) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? v : null);

/** A mask row's place on its frame, or nothing when the row is not shaped as one (an older or hand-made row). */
export function placeOf(payload: Record<string, unknown>): { place?: SharePlace } {
  const frame = nums(payload.frame, 2) as SharePlace["frame"] | null;
  const box = nums(payload.box, 4) as SharePlace["box"] | null;
  if (!frame || !box || frame[0] <= 0 || frame[1] <= 0) return {};
  // Only M, L and Z with numbers: the outline is drawn as an SVG path, so nothing else may reach it.
  const outline = typeof payload.outline === "string" && /^[MLZ0-9.\s-]+$/.test(payload.outline) ? payload.outline : null;
  return { place: { frame, box, outline } };
}

/**
 * The public extras for a shared project: which model or connector wrote each layer, a few real rows per layer,
 * and (only when the owner agreed) its photos, videos and kept screen frames with what the models found in each.
 */
export async function loadShareView(projectId: string, slug: string, withMedia: boolean): Promise<ShareView> {
  return loadProjectView(projectId, withMedia ? (id) => `/api/explore/${slug}/media/${id}` : null, true);
}

/** The same view for the owner in their studio: always with media, served by the owner-only route. */
export function loadOwnerView(projectId: string): Promise<ShareView> {
  return loadProjectView(projectId, (id) => `/api/studio/${projectId}/media/${id}`);
}

// Body check-ins are private by design: their photos and the ids that point at them never reach a public replay.
const BODY_TYPES = new Set(["body_view", "body_progress"]);
const BODY_FIELDS = ["file", "upload_id", "baseline_upload_id"];
const bodyLaneUploads = (projectId: string) =>
  db.select({ id: uploads.id }).from(uploads).innerJoin(sourceLanes, eq(sourceLanes.id, uploads.laneId)).where(and(eq(uploads.projectId, projectId), eq(sourceLanes.analyzer, "body")));

/**
 * Product rows as a public replay may show them: body check-ins never point at their photos, and without shared
 * media no row points at any file. The owner's own pages use the rows as they are.
 */
export function publicDatasets(sets: Dataset[], withMedia: boolean): Dataset[] {
  return sets.map((d) => {
    const hide = BODY_TYPES.has(d.type) ? BODY_FIELDS : withMedia ? [] : PRIVATE_FIELDS;
    if (!hide.length) return d;
    return { ...d, rows: d.rows.map((r) => ({ ...r, payload: Object.fromEntries(Object.entries(r.payload as Record<string, unknown>).filter(([k]) => !hide.includes(k))) })) };
  });
}

async function loadProjectView(projectId: string, mediaSrc: ((id: string) => string) | null, pub = false): Promise<ShareView> {
  const withMedia = mediaSrc !== null;
  const [made, recent] = await Promise.all([
    db.execute<{ type: string; model: string | null; connector: string | null; n: number }>(
      sql`select type, provenance->>'producer' as model, provenance->>'connector' as connector, count(*)::int as n from observations where project_id = ${projectId} group by 1, 2, 3 order by n desc`,
    ),
    db.execute<{ type: string; t: number; payload: Record<string, unknown>; confidence: number | null }>(
      // Epoch milliseconds, not a timestamp string the driver might read as local time.
      sql`select type, (extract(epoch from event_time) * 1000)::float8 as t, payload, confidence from (select type, event_time, payload, confidence, row_number() over (partition by type order by event_time desc) as rn from observations where project_id = ${projectId}) x where rn <= 3`,
    ),
  ]);

  const producers: Record<string, ShareProducer> = {};
  for (const r of made) producers[`l:${r.type}`] ??= { model: r.model, connector: r.connector };
  const samples: Record<string, ShareSample[]> = {};
  for (const r of recent) {
    const hide = pub && BODY_TYPES.has(r.type) ? BODY_FIELDS : withMedia ? [] : PRIVATE_FIELDS;
    const payload = Object.fromEntries(Object.entries(r.payload).filter(([k]) => !hide.includes(k)));
    (samples[`l:${r.type}`] ??= []).push({ t: Number(r.t), payload, confidence: r.confidence });
  }
  if (!mediaSrc) return { media: null, producers, samples };

  const src = mediaSrc;
  const hidden = new Set(pub ? (await bodyLaneUploads(projectId)).map((u) => u.id) : []);
  const files = (await db.select().from(uploads).where(and(eq(uploads.projectId, projectId), eq(uploads.status, "ready"))).orderBy(desc(uploads.createdAt)).limit(MEDIA_LIMIT))
    .filter((u) => !hidden.has(u.id) && (IMAGE.has(extensionOf(u.filename)) || VIDEO.has(extensionOf(u.filename))));
  const [found, frames] = await Promise.all([
    files.length
      ? db.select({ uploadId: observations.uploadId, type: observations.type, payload: observations.payload, confidence: observations.confidence }).from(observations).where(and(inArray(observations.uploadId, files.map((f) => f.id)), ne(observations.type, "video_frame")))
      : [],
    db.execute<{ id: string; key: string; type: string; t: number; payload: Record<string, unknown>; confidence: number | null }>(
      sql`select id, provenance->>'frame' as key, type, (extract(epoch from event_time) * 1000)::float8 as t, payload, confidence from observations where project_id = ${projectId} and provenance ? 'frame' order by event_time desc limit ${MEDIA_LIMIT * 4}`,
    ),
  ]);

  const media: ShareMedia[] = files.map((f) => ({
    id: f.id,
    kind: VIDEO.has(extensionOf(f.filename)) ? "video" : "image",
    t: f.createdAt.getTime(),
    name: f.filename,
    src: src(f.id),
    source: f.timelineId ? tlKey(f.timelineId) : "files",
    findings: found.filter((o) => o.uploadId === f.id).map((o) => findingOf(o.type, o.payload, o.confidence)),
  }));
  // One frame can carry several rows (a count and a breakdown); show it once with all of them.
  // Video frames are named by their second of the clip and sit on the video's own source.
  const byKey = new Map<string, ShareMedia>();
  const uploadOf = new Map(files.map((f) => [f.id, f]));
  for (const r of frames) {
    const t = Number(r.t);
    const video = typeof r.payload.upload_id === "string" && typeof r.payload.at === "string" ? uploadOf.get(r.payload.upload_id) : undefined;
    const m = byKey.get(r.key) ?? {
      id: r.id,
      kind: "frame" as const,
      t,
      name: video ? `${video.filename} · ${r.payload.at}` : "Screen frame",
      src: src(r.id),
      source: video ? (video.timelineId ? tlKey(video.timelineId) : "files") : "screen",
      findings: [],
    };
    if (r.type !== "video_frame") m.findings.push(findingOf(r.type, r.payload, r.confidence));
    byKey.set(r.key, m);
  }
  media.push(...[...byKey.values()].slice(0, MEDIA_LIMIT));
  return { media: media.sort((a, b) => a.t - b.t), producers, samples };
}

/** The storage key behind one public media id, or null if the owner has not agreed to show it. */
export async function sharedMediaKey(slug: string, id: string) {
  const [p] = await db.select({ id: projects.id, media: projects.shareMedia }).from(projects).where(and(eq(projects.shareSlug, slug), isNotNull(projects.sharedAt)));
  if (!p?.media) return null;
  const [body] = await db.select({ id: uploads.id }).from(uploads).innerJoin(sourceLanes, eq(sourceLanes.id, uploads.laneId)).where(and(eq(uploads.id, id), eq(sourceLanes.analyzer, "body")));
  return body ? null : projectMediaKey(p.id, id);
}

/** The storage key behind one media id (an upload or a kept frame) of a project, or null. Callers check who may see it. */
export async function projectMediaKey(projectId: string, id: string) {
  const [up] = await db.select({ key: uploads.key, name: uploads.filename }).from(uploads).where(and(eq(uploads.id, id), eq(uploads.projectId, projectId), eq(uploads.status, "ready")));
  if (up) return IMAGE.has(extensionOf(up.name)) || VIDEO.has(extensionOf(up.name)) ? up.key : null;
  const [frame] = await db.execute<{ key: string | null }>(sql`select provenance->>'frame' as key from observations where id = ${id} and project_id = ${projectId}`);
  return frame?.key ?? null;
}

export async function getShared(slug: string) {
  const [r] = await db.select(sharedCols).from(projects).innerJoin(user, eq(user.id, projects.userId)).where(and(eq(projects.shareSlug, slug), isNotNull(projects.sharedAt)));
  if (!r) return null;
  const prods = await productsOf([r.id]);
  return { ...r, owner: firstName(r.owner), products: prods.get(r.id) ?? [] };
}

/** The cache tag on a shared replay. The share actions clear it whenever what the public may see changes. */
export const sharedTag = (slug: string) => `share:${slug}`;

/** The cache tag on the list of shared projects (landing and /explore). Cleared when a project is shared, unshared, renamed or deleted. */
export const SHARED_LIST_TAG = "shared-list";
