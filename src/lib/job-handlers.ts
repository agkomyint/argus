import "server-only";
import { analyzeFrame } from "@/lib/capture";
import { investigate } from "@/lib/agents/orchestrator";
import { pollSource, processUpload } from "@/lib/connectors";
import { enqueue, type JobHandler, type JobKind } from "@/lib/jobs";
import { db } from "@/db";
import { observations, projects } from "@/db/schema";
import { resolveConfig } from "@/lib/agent-config";
import { and, eq, gte, sql } from "drizzle-orm";
import { traced, withTrace } from "@/lib/trace";
import { analyzeVideoFrame } from "@/sources/video";
import { personaPanelOn, reviewScreen } from "@/lib/persona-review";
import { bodyCheck } from "@/lib/body-check";
import { uploads } from "@/db/schema";
import { tlKey } from "@/lib/source-key";
import { extensionOf } from "@/lib/uploads";
import { locateLater } from "@/lib/sam";

export const HANDLERS: Record<JobKind, JobHandler> = {
  async process_upload(job) {
    const uploadId = String(job.payload.uploadId);
    const result = await withTrace({ uploadId }, () => traced({ kind: "code", name: "upload.process", input: { uploadId } }, () => processUpload(uploadId)));
    // Strong detections go straight to the agents; the human review step still gates the alert.
    const [proj] = await db.select({ config: projects.agentConfig }).from(projects).where(eq(projects.id, job.projectId));
    const minConfidence = resolveConfig(proj?.config).perception.minConfidence;
    const found = await db
      .select({ id: observations.id, confidence: observations.confidence })
      .from(observations)
      .where(and(eq(observations.uploadId, String(job.payload.uploadId)), eq(observations.type, "defect_detected"), gte(observations.confidence, minConfidence)));
    // One photo, one case: investigate the strongest finding; the rest stay as observations.
    const top = [...found].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    if (top) await enqueue(job.projectId, "investigate", { observationId: top.id });
    const [up] = await db.select({ filename: uploads.filename, timelineId: uploads.timelineId }).from(uploads).where(eq(uploads.id, uploadId));
    const source = up?.timelineId ? tlKey(up.timelineId) : undefined;
    // A photo in a body lane is a daily check-in; it never goes to the persona panel.
    if ((result as { body_check?: boolean }).body_check) {
      await enqueue(job.projectId, "body_check", { uploadId }, { source });
      return { ...result, investigations: 0, reviews: 0 };
    }
    // Screenshots also go to the persona panel when a persona product asked for it, or the lane is for screens.
    let reviews = 0;
    if (up && ["jpg", "jpeg", "png", "webp"].includes(extensionOf(up.filename)) && ((result as { persona_panel?: boolean }).persona_panel || (await personaPanelOn(job.projectId)))) {
      await enqueue(job.projectId, "review_screen", { uploadId }, { source });
      reviews = 1;
    }
    return { ...result, investigations: top ? 1 : 0, reviews };
  },
  async analyze_frame(job) {
    return analyzeFrame(job.projectId, job.payload);
  },
  async analyze_video_frame(job) {
    return withTrace({ uploadId: String(job.payload.uploadId) }, () => analyzeVideoFrame(job.projectId, job.payload));
  },
  async review_screen(job) {
    const uploadId = String(job.payload.uploadId);
    return withTrace({ uploadId }, () => reviewScreen(uploadId));
  },
  async body_check(job) {
    const uploadId = String(job.payload.uploadId);
    return withTrace({ uploadId }, () => bodyCheck(uploadId));
  },
  async locate_objects(job) {
    return withTrace({ uploadId: String(job.payload.uploadId) }, () => locateLater(job.projectId, job.payload));
  },
  async poll_source(job) {
    const sourceId = String(job.payload.sourceId);
    return traced({ kind: "code", name: "source.poll", input: { sourceId } }, () => pollSource(sourceId));
  },
  async investigate(job) {
    // Don't duplicate an alert for the same observation.
    const dup = await db.execute<{ n: number }>(sql`select count(*)::int as n from alerts where observation_id = ${String(job.payload.observationId)}`);
    if ((dup[0]?.n ?? 0) > 0) return { skipped: "alert already exists" };
    return investigate(String(job.payload.observationId));
  },
};
