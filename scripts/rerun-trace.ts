import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { investigate } from "@/lib/agents/orchestrator";

// Re-run the agents on the alert's trigger so its trace has input/output. Replaces the old alert.
const projectId = process.argv[2];
const rows = await db.select().from(alerts).where(eq(alerts.projectId, projectId));
for (const a of rows) {
  if (!a.observationId) continue;
  const r = await investigate(a.observationId);
  await db.delete(alerts).where(and(eq(alerts.id, a.id)));
  console.log("replaced", a.id.slice(0, 8), "->", r.alertId.slice(0, 8), r.severity, r.claims, r.rejected);
}
process.exit(0);
