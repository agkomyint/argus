import { z } from "zod";

/**
 * Per-project settings for each agent. Everything has a default, so a project with no saved
 * config behaves exactly as before. Bounds keep a bad value from disabling the safety rails.
 */
export const agentConfigSchema = z.object({
  perception: z.object({ minConfidence: z.number().min(0.3).max(0.95) }),
  correlation: z.object({ windowMinutes: z.number().int().min(15).max(240) }),
  analysis: z.object({
    vibrationRatio: z.number().min(1.1).max(3),
    rainMm: z.number().min(2).max(50),
    mediumAt: z.number().int().min(1).max(6),
    highAt: z.number().int().min(2).max(7),
  }),
  reasoning: z.object({ guidance: z.string().max(300) }),
  /** null follows the cost/accuracy level chosen above. */
  verification: z.object({ strict: z.boolean().nullable(), maxClaims: z.number().int().min(1).max(8).nullable() }),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentId = keyof AgentConfig;

export const DEFAULT_CONFIG: AgentConfig = {
  perception: { minConfidence: 0.5 },
  correlation: { windowMinutes: 60 },
  analysis: { vibrationRatio: 1.5, rainMm: 10, mediumAt: 2, highAt: 4 },
  reasoning: { guidance: "" },
  verification: { strict: null, maxClaims: null },
};

/** Merge whatever is stored over the defaults; invalid or missing pieces fall back to the default. */
export function resolveConfig(raw: unknown): AgentConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<AgentId, unknown>>;
  const out = { ...DEFAULT_CONFIG };
  for (const id of Object.keys(DEFAULT_CONFIG) as AgentId[]) {
    const merged = { ...DEFAULT_CONFIG[id], ...((r[id] as object | undefined) ?? {}) };
    const ok = agentConfigSchema.shape[id].safeParse(merged);
    if (ok.success) (out as Record<AgentId, unknown>)[id] = ok.data;
  }
  if (out.analysis.highAt <= out.analysis.mediumAt) out.analysis = DEFAULT_CONFIG.analysis;
  return out;
}

/**
 * Lanes split the line by how sure Perception was. The first enabled lane whose range holds the
 * finding takes it; anything unmatched runs the standard line above. "quick" skips the model.
 */
export const laneSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().trim().min(1).max(30),
    enabled: z.boolean(),
    from: z.number().min(0).max(1),
    to: z.number().min(0).max(1),
    recipe: z.enum(["full", "quick"]),
    /** null follows the project's cost/accuracy level. */
    level: z.number().int().min(0).max(4).nullable(),
  })
  .refine((l) => l.to > l.from, { message: "A lane's upper bound must be above its lower bound" });
export const lanesSchema = z.array(laneSchema).max(4);
export type Lane = z.infer<typeof laneSchema>;

export function resolveLanes(raw: unknown): Lane[] {
  const lanes = raw && typeof raw === "object" ? (raw as { lanes?: unknown }).lanes : undefined;
  const ok = lanesSchema.safeParse(lanes ?? []);
  return ok.success ? ok.data : [];
}

export function pickLane(lanes: Lane[], confidence: number | null): Lane | null {
  const c = confidence ?? 0;
  return lanes.find((l) => l.enabled && c >= l.from && (c < l.to || (l.to >= 1 && c <= 1))) ?? null;
}
