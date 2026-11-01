"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { consumerApps } from "@/db/schema";
import { APP_KIND_IDS, contractProblems, timelineProblem } from "@/lib/app-contract";
import { enabledProducts } from "@/lib/project-reads";
import { getAccount } from "@/lib/session";

/** The Apps window: save, switch and remove a project's apps. The contract is checked here, not only in the form. */

const MAX_APPS = 8;
const refresh = () => revalidatePath("/studio", "layout");

const appSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Give the app a name").max(60),
  kind: z.enum(APP_KIND_IDS),
  reads: z.array(z.string().max(80)).max(8),
  rule: z.object({
    dials: z.record(z.string().max(80), z.number().finite().min(0).max(100_000)),
    severity: z.enum(["low", "medium", "high"]),
    cooldownMin: z.number().finite().min(0).max(1440),
    browserAlert: z.boolean(),
  }),
  on: z.boolean(),
  onTimeline: z.boolean(),
});

export type AppInput = z.infer<typeof appSchema>;

async function own(projectId: string) {
  const account = await getAccount();
  return account && z.uuid().safeParse(projectId).success && account.projects.some((p) => p.id === projectId) ? account : null;
}

export async function saveApp(projectId: string, input: AppInput): Promise<{ error: string } | { ok: true }> {
  if (!(await own(projectId))) return { error: "You can only change your own projects" };
  const parsed = appSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const app = parsed.data;
  if (app.kind !== "watcher") return { error: "Only Watcher apps are built so far" };

  // Only products this project has switched on, so an app never reads something the project does not have.
  const mine = await enabledProducts(projectId);
  const picked = app.reads.flatMap((id) => mine.filter((p) => p.id === id));
  if (picked.length !== app.reads.length) return { error: "An app can only read products this project has switched on" };
  const facts = picked.map((p) => ({ id: p.id, name: p.name, kind: p.kind, observationTypes: p.observationTypes }));
  const problem = contractProblems(app.kind, facts)[0] ?? (app.onTimeline ? timelineProblem(facts) : null);
  if (problem) return { error: problem };

  const row = { name: app.name, kind: app.kind, reads: app.reads, rule: app.rule, on: app.on, onTimeline: app.onTimeline };
  if (app.id) {
    const done = await db.update(consumerApps).set(row).where(and(eq(consumerApps.id, app.id), eq(consumerApps.projectId, projectId))).returning({ id: consumerApps.id });
    if (!done.length) return { error: "That app is gone" };
  } else {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(consumerApps).where(eq(consumerApps.projectId, projectId));
    if (n >= MAX_APPS) return { error: `A project can have ${MAX_APPS} apps. Remove one first.` };
    await db.insert(consumerApps).values({ projectId, ...row });
  }
  refresh();
  return { ok: true };
}

export async function removeApp(projectId: string, id: string): Promise<{ error: string } | { ok: true }> {
  if (!(await own(projectId)) || !z.uuid().safeParse(id).success) return { error: "You can only change your own projects" };
  await db.delete(consumerApps).where(and(eq(consumerApps.id, id), eq(consumerApps.projectId, projectId)));
  refresh();
  return { ok: true };
}
