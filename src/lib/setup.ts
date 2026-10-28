import "server-only";
import { and, eq, gt, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { laneProducts, sourceLanes, timelines, traces } from "@/db/schema";
import { cleanPlan, planProblems, type SetupPlan } from "@/lib/setup-rules";
import { traced } from "@/lib/trace";

/**
 * Create the lanes and their product links for a new project from a setup plan the person confirmed.
 * The plan is checked again here, since it came back from the browser. The setup traces written before
 * the project existed are moved onto it, so the Observatory shows how the project was planned.
 */
export async function applySetupPlan(projectId: string, userId: string, raw: SetupPlan, picked: string[]) {
  const plan = cleanPlan(raw);
  const problems = planProblems(plan, picked);
  if (problems.length) return { problems };
  return traced(
    { kind: "code", name: "setup.create_lanes", input: { lanes: plan.lanes.map((l) => ({ name: l.name, analyzer: l.analyzer, feeds: l.feeds })) }, output: (r) => r },
    async () => {
      const [tl] = await db.insert(timelines).values({ projectId, name: "Lanes" }).returning();
      const lanes = await db.insert(sourceLanes).values(plan.lanes.map((l) => ({ projectId, timelineId: tl.id, name: l.name, note: l.note, analyzer: l.analyzer }))).returning();
      const links = lanes.flatMap((row, i) => plan.lanes[i].feeds.map((productId) => ({ laneId: row.id, projectId, productId })));
      if (links.length) await db.insert(laneProducts).values(links);
      const claimed = await db
        .update(traces)
        .set({ projectId })
        .where(and(eq(traces.userId, userId), isNull(traces.projectId), like(traces.name, "setup.%"), gt(traces.createdAt, new Date(Date.now() - 60 * 60_000))))
        .returning({ id: traces.id });
      return { problems: [] as string[], lanes: lanes.length, links: links.length, tracesClaimed: claimed.length };
    },
  );
}
