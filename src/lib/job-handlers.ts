import "server-only";
import { analyzeFrame } from "@/lib/capture";
import { investigate } from "@/lib/agents/orchestrator";
import { pollSource, processUpload } from "@/lib/connectors";
import { enqueue, type JobHandler, type JobKind } from "@/lib/jobs";
import { db } from "@/db";
import { observations, projects } from "@/db/schema";
import { resolveConfig } from "@/lib/agent-config";
import { and, eq, gte, sql } from "drizzle-orm";

export const HANDLERS: Record<JobKind, JobHandler> = {
  async process_upload(job) {
    const result = await processUpload(String(job.payload.uploadId));
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
    return { ...result, investigations: top ? 1 : 0 };
  },
  async analyze_frame(job) {
    return analyzeFrame(job.projectId, job.payload);
  },
  async poll_source(job) {
    return pollSource(String(job.payload.sourceId));
  },
  async investigate(job) {
    // Don't duplicate an alert for the same observation.
    const dup = await db.execute<{ n: number }>(sql`select count(*)::int as n from alerts where observation_id = ${String(job.payload.observationId)}`);
    if ((dup[0]?.n ?? 0) > 0) return { skipped: "alert already exists" };
    return investigate(String(job.payload.observationId));
  },
};
