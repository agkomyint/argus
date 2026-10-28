import "server-only";
import { generateText, Output } from "ai";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { observations, sourceLanes, uploads } from "@/db/schema";
import { BODY_REGIONS, dayOf, isDay, score } from "@/lib/body-math";
import { bodyProgress } from "@/lib/fusion";
import { chatModel } from "@/lib/meta";
import { recordObservation } from "@/lib/observations";
import { s3 } from "@/lib/s3";
import { extensionOf } from "@/lib/uploads";
import { MODEL_ID, traced } from "@/lib/trace";

const region = z.number().int().min(0).max(10).describe("Visible muscle definition, 1 = none visible, 10 = very sharp. 0 = this area is not in the photo");

const checkSchema = z.object({
  view: z.enum(["front", "side", "back", "other"]).describe("Which way the body faces the camera"),
  lighting: z.enum(["even", "dim", "harsh"]).describe("How the light falls on the body"),
  comparable: z.boolean().describe("True when this shot matches the day 1 photo closely enough to compare: same view, similar pose, distance and light. True when there is no day 1 photo"),
  ...Object.fromEntries(BODY_REGIONS.map((r) => [r, region])) as Record<(typeof BODY_REGIONS)[number], typeof region>,
  summary: z.string().describe("One neutral sentence on what is visible, or on what changed since day 1 if given. Under 25 words"),
});

export type BodyView = z.infer<typeof checkSchema>;

const mediaTypeOf = (filename: string, contentType: string | null) => {
  const ext = extensionOf(filename);
  return contentType || `image/${ext === "jpg" ? "jpeg" : ext}`;
};

/**
 * A daily body check-in. The model scores how defined each area looks in today's photo, looking at day 1's
 * photo too so it can say whether the shots are comparable. Code then compares the days (fusion.body_progress).
 * The photo's day is the one the person picked, not the upload time, so a late upload lands on the right day.
 */
export async function bodyCheck(uploadId: string) {
  const [up] = await db.select().from(uploads).where(eq(uploads.id, uploadId));
  if (!up || up.status !== "ready") throw new Error("Upload not found or not complete");
  const [lane] = up.laneId ? await db.select().from(sourceLanes).where(eq(sourceLanes.id, up.laneId)) : [];
  if (!lane) throw new Error("A body check-in needs a lane");
  const day = isDay(up.takenOn) ? up.takenOn : dayOf(up.createdAt);
  const eventTime = new Date(`${day}T12:00:00Z`);

  // Day 1: the earliest day in this lane from another upload; if that day has several photos the last one counts, as in latestPerDay.
  const [first] = await db
    .select({ uploadId: observations.uploadId, day: sql<string>`payload->>'day'`, payload: observations.payload })
    .from(observations)
    .where(and(eq(observations.projectId, up.projectId), eq(observations.type, "body_view"), sql`payload->>'lane_id' = ${lane.id}`, sql`${observations.uploadId} <> ${up.id}`))
    .orderBy(asc(sql`payload->>'day'`), desc(observations.arrivalTime))
    .limit(1);
  const [base] = first?.uploadId && first.day < day ? await db.select().from(uploads).where(eq(uploads.id, first.uploadId)) : [];

  const bytes = new Uint8Array(await s3.file(up.key).arrayBuffer());
  const baseBytes = base ? new Uint8Array(await s3.file(base.key).arrayBuffer()) : null;

  // Day 1's own scores go along so an unchanged body keeps the same numbers instead of drifting with each call.
  const baseScores = base ? BODY_REGIONS.map((r) => `${r} ${(first!.payload as Record<string, unknown>)[r] ?? 0}`).join(", ") : "";
  const what = `${lane.name}${lane.note ? ` (${lane.note})` : ""}`;
  const step = { kind: "model" as const, name: "body.check", model: MODEL_ID(), input: { lane: lane.name, day, image: bytes, day1: baseBytes ? { day: first!.day, image: baseBytes } : null } };
  const { output } = await traced({ ...step, output: (r) => r.output, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: checkSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `This is a fitness progress photo the person took of themselves for their own private log, lane "${what}", dated ${day}.` +
              ` Score how clearly the muscles of each area can be seen, from what is visible only. Do not estimate body-fat percentage or weight,` +
              ` do not give health, diet or medical advice, and do not comment on attractiveness.` +
              (baseBytes ? ` The second image is their day 1 photo from ${first!.day}: use it to judge whether the two shots are comparable, and describe the visible change if any.` +
                ` Day 1 was scored ${baseScores} (0 = not visible). Start from those scores and move an area only when you can see a clear difference; if nothing visibly changed, give the same scores.` : " There is no day 1 photo yet; this one becomes day 1."),
          },
          { type: "image", image: bytes, mediaType: mediaTypeOf(up.filename, up.contentType) },
          ...(baseBytes && base ? [{ type: "image" as const, image: baseBytes, mediaType: mediaTypeOf(base.filename, base.contentType) }] : []),
        ],
      },
    ],
  }));

  const scores = Object.fromEntries(BODY_REGIONS.map((r) => [r, score(output[r])]));
  const view = await traced({ kind: "code", name: "body.record", input: { lane: lane.name, day }, observations: (r: string) => [r] }, async () => {
    // A re-run of the same photo (a retried job) replaces its rows instead of counting the day twice.
    await db.delete(observations).where(and(eq(observations.uploadId, up.id), inArray(observations.type, ["body_view", "body_progress"])));
    const row = await recordObservation({
      projectId: up.projectId,
      uploadId: up.id,
      type: "body_view",
      eventTime,
      payload: { file: up.filename, upload_id: up.id, lane: lane.name, lane_id: lane.id, day, view: output.view, lighting: output.lighting, comparable: baseBytes ? output.comparable : true, ...scores, summary: output.summary },
      provenance: { connector: "body-check", producer: MODEL_ID(), estimate: true },
    });
    return row.id;
  });

  const progress = await bodyProgress(up.projectId, up.id, lane.id, lane.name, day, eventTime, output.summary);
  return { day, observations: [view, progress.id].length, comparable: baseBytes ? output.comparable : true, baseline: first?.day ?? day };
}
