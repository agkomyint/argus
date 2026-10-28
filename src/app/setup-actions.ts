"use server";

import { z } from "zod";
import { planSetupLanes, suggestSetupProducts, type LanePlanResult, type ProductSuggestion } from "@/lib/agents/orchestrator";
import { supportedProducts } from "@/lib/setup-rules";
import { getAccount } from "@/lib/session";
import { withTrace } from "@/lib/trace";

const goalSchema = z.string().trim().min(3, "Say in a few words what you want to track").max(400);

/** AI setup, step 1: the person's goal in, suggested products out. Traced under the person until the project exists. */
export async function suggestProductsFor(goal: string): Promise<ProductSuggestion | { error: string }> {
  const account = await getAccount();
  if (!account) return { error: "You are signed out" };
  const g = goalSchema.safeParse(goal);
  if (!g.success) return { error: g.error.issues[0].message };
  try {
    return await withTrace({ userId: account.user.id }, () => suggestSetupProducts(g.data));
  } catch {
    return { error: "The model did not answer. Try again, or pick products yourself." };
  }
}

/** AI setup, steps 2 to 4: lanes for the picked products, each linked to what it feeds, checked by code. */
export async function planLanesFor(goal: string, picked: string[]): Promise<LanePlanResult | { error: string }> {
  const account = await getAccount();
  if (!account) return { error: "You are signed out" };
  const ids = [...new Set(picked)].filter((id) => supportedProducts().some((p) => p.id === id));
  if (!ids.length) return { error: "Pick at least one data product" };
  try {
    return await withTrace({ userId: account.user.id }, () => planSetupLanes(goal.trim().slice(0, 400) || "Track these products", ids));
  } catch {
    return { error: "The model did not answer. Try again." };
  }
}
