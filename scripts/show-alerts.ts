import { desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { alerts, observations } from "../src/db/schema";
const pid = process.argv[2];
for (const o of await db.select().from(observations).where(eq(observations.projectId, pid)))
  if (o.type === "defect_detected") console.log("DETECTION", o.confidence, JSON.stringify(o.payload), o.assetId ? "asset-matched" : "NO ASSET");
for (const a of await db.select().from(alerts).where(eq(alerts.projectId, pid)).orderBy(desc(alerts.createdAt))) {
  const r = a.report as { claims: { text: string }[]; rejectedClaims: { text: string; reason: string }[]; severityReasons: string[]; recommendedAction: string; limitations: string[] };
  console.log("\nALERT", a.severity.toUpperCase(), "|", a.title, "\n ", a.summary, "\n  rule:", r.severityReasons.join("; "), "\n  claims:", r.claims.map((c) => c.text), "\n  rejected:", r.rejectedClaims.map((c) => c.reason), "\n  action:", r.recommendedAction);
}
process.exit(0);
