// Clears alerts, detections, uploads and upload/investigate jobs for a project. Run: bun --conditions react-server scripts/demo-reset.ts <projectId>
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { alerts, jobs, observations, uploads } from "../src/db/schema";
const [pid] = process.argv.slice(2);
await db.delete(alerts).where(eq(alerts.projectId, pid));
await db.delete(observations).where(and(eq(observations.projectId, pid), eq(observations.type, "defect_detected")));
await db.delete(jobs).where(and(eq(jobs.projectId, pid), inArray(jobs.kind, ["investigate", "process_upload"])));
await db.delete(uploads).where(eq(uploads.projectId, pid));
console.log("reset");
process.exit(0);
