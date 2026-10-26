// End-to-end check of the pipeline without the UI: sample data -> queue -> agents -> pending alert.
// Run: bun --conditions react-server scripts/pipeline-smoke.ts
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { alerts, projects, user } from "../src/db/schema";
import { drainJobs, enqueue } from "../src/lib/jobs";
import { recordObservation, upsertAsset } from "../src/lib/observations";
import { sources } from "../src/db/schema";
import { newIngestKey } from "../src/lib/connectors";

const [u] = await db.select().from(user).where(eq(user.email, "maya@demo.argus.dev"));
const [project] = await db.insert(projects).values({ userId: u.id, name: "Smoke test", kind: "other" }).returning();
const pid = project.id;

await upsertAsset(pid, "Pier A", { kind: "bridge pier", lat: 16.84, lng: 96.17, aliases: ["Bridge Pier 01"] });
await recordObservation({ projectId: pid, type: "inspection", eventTime: new Date(Date.now() - 180 * 864e5), assetName: "Pier A", payload: { rating: 4, finding: "Hairline crack" } });
const [weather] = await db.insert(sources).values({ projectId: pid, kind: "weather", name: "w", config: { lat: 16.84, lng: 96.17 }, ingestKey: newIngestKey() }).returning();
const [sensor] = await db.insert(sources).values({ projectId: pid, kind: "sensor_sim", name: "s", config: { asset: "Pier A", surge: true }, ingestKey: newIngestKey() }).returning();
await enqueue(pid, "poll_source", { sourceId: weather.id }, { drain: false });
await enqueue(pid, "poll_source", { sourceId: sensor.id }, { drain: false });
const det = await recordObservation({ projectId: pid, type: "defect_detected", eventTime: new Date(), assetName: "Bridge Pier 01", confidence: 0.82, payload: { label: "crack", description: "sample" }, provenance: { simulated: true } });
await enqueue(pid, "investigate", { observationId: det.id }, { drain: false });

console.log("ran jobs:", await drainJobs());
const rows = await db.select().from(alerts).where(eq(alerts.projectId, pid));
for (const a of rows) {
  const r = a.report as { claims: unknown[]; rejectedClaims: unknown[]; trace: unknown[]; limitations: string[] };
  console.log(JSON.stringify({ title: a.title, severity: a.severity, status: a.status, summary: a.summary, claims: r.claims.length, rejected: r.rejectedClaims.length, trace: r.trace, limitations: r.limitations }, null, 2));
}
console.log("project", pid);
process.exit(0);
