"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { LANE_ANALYZERS, LANE_INPUTS, projectProducts, sourceLanes } from "@/db/schema";
import { suggestOneLane, type LaneSuggestion } from "@/lib/agents/orchestrator";
import { createLane, removeLane, setLaneFeeds } from "@/lib/lane-links";
import { getAccount } from "@/lib/session";
import { cleanPlan, laneProblems, MAX_LANES, type SetupLane } from "@/lib/setup-rules";
import { withTrace } from "@/lib/trace";

/** The Lanes window: make a lane from plain words, change what it feeds, all checked by code here. */

const refresh = () => revalidatePath("/studio", "layout");

async function own(projectId: string) {
  const account = await getAccount();
  if (!account || !z.uuid().safeParse(projectId).success || !account.projects.some((p) => p.id === projectId)) return null;
  const [on, lanes] = await Promise.all([
    db.select({ id: projectProducts.productId }).from(projectProducts).where(eq(projectProducts.projectId, projectId)),
    db.select({ name: sourceLanes.name }).from(sourceLanes).where(eq(sourceLanes.projectId, projectId)),
  ]);
  return { userId: account.user.id, on: on.map((r) => r.id), taken: lanes.map((l) => l.name) };
}

const wordsSchema = z.string().trim().min(2, "Say in a few words what goes in this lane").max(300);

export async function suggestLaneFor(projectId: string, words: string): Promise<LaneSuggestion | { error: string }> {
  const ctx = await own(projectId);
  if (!ctx) return { error: "You can only change your own projects" };
  const w = wordsSchema.safeParse(words);
  if (!w.success) return { error: w.error.issues[0].message };
  try {
    return await withTrace({ projectId, userId: ctx.userId }, () => suggestOneLane(w.data, ctx.on, ctx.taken));
  } catch {
    return { error: "The model did not answer. Try again, or set the lane up yourself." };
  }
}

const laneSchema = z.object({ name: z.string(), note: z.string(), analyzer: z.enum(LANE_ANALYZERS), feeds: z.array(z.string()).max(20), input: z.enum(LANE_INPUTS).optional() });

export async function createLaneIn(projectId: string, raw: SetupLane): Promise<{ error?: string; id?: string }> {
  const ctx = await own(projectId);
  if (!ctx) return { error: "You can only change your own projects" };
  const parsed = laneSchema.safeParse(raw);
  if (!parsed.success) return { error: "That lane is not valid" };
  if (ctx.taken.length >= MAX_LANES * 2) return { error: "This project has as many lanes as it can hold" };
  const [lane] = cleanPlan({ lanes: [parsed.data] }).lanes;
  const problems = laneProblems(lane, ctx.on, ctx.taken);
  if (problems.length) return { error: problems[0] };
  const made = await createLane(projectId, lane);
  refresh();
  return { id: made.lane.id };
}

export async function setLaneFeedsIn(projectId: string, laneId: string, feeds: string[]) {
  const ctx = await own(projectId);
  if (!ctx || !z.uuid().safeParse(laneId).success) return;
  const [lane] = await db.select().from(sourceLanes).where(and(eq(sourceLanes.id, laneId), eq(sourceLanes.projectId, projectId)));
  if (!lane) return;
  await setLaneFeeds(projectId, lane.id, lane, feeds);
  refresh();
}

export async function deleteLaneIn(projectId: string, laneId: string) {
  const ctx = await own(projectId);
  if (!ctx || !z.uuid().safeParse(laneId).success) return;
  await removeLane(projectId, laneId);
  refresh();
}
