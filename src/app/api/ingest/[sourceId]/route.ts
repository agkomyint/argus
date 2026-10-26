import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { recordObservation } from "@/lib/observations";

const item = z.object({
  type: z.string().min(1).max(60),
  eventTime: z.iso.datetime({ offset: true }).optional(),
  asset: z.string().max(200).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).optional(),
});

// Push connector: any system can POST observations here with the source's ingest key.
export async function POST(req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await ctx.params;
  const key = req.headers.get("x-ingest-key");
  if (!z.uuid().safeParse(sourceId).success) return Response.json({ error: "Not found" }, { status: 404 });
  const [src] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!src || !key || src.ingestKey !== key) return Response.json({ error: "Invalid source or key" }, { status: 401 });
  if (src.paused) return Response.json({ error: "This source is paused in ARGUS" }, { status: 423 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = z.array(item).min(1).max(500).safeParse(Array.isArray(body) ? body : [body]);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, path: parsed.error.issues[0].path }, { status: 422 });

  const ids: string[] = [];
  for (const o of parsed.data) {
    const row = await recordObservation({
      projectId: src.projectId,
      sourceId: src.id,
      type: o.type,
      eventTime: o.eventTime ? new Date(o.eventTime) : new Date(),
      assetName: o.asset,
      payload: o.payload,
      confidence: o.confidence,
      provenance: { connector: "webhook", source: src.name },
    });
    ids.push(row.id);
  }
  return Response.json({ accepted: ids.length, ids }, { status: 201 });
}
