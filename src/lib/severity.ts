import { DEFAULT_CONFIG, type AgentConfig } from "@/lib/agent-config";

/** The few fields severity reads. Kept small so the Agents page can replay it in the browser. */
export type SeverityInput = {
  confidence: number | null;
  vibrationRatio: number | null;
  rainMm24h: number | null;
  worstRating: number | null;
};

/** Severity is a rule over the fused facts. The model never decides it. Thresholds come from the Analysis agent's settings. */
export function severityOf(f: SeverityInput, cfg: AgentConfig["analysis"] = DEFAULT_CONFIG.analysis): { level: "low" | "medium" | "high"; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const conf = f.confidence ?? 0;
  if (conf >= 0.8) { score += 2; reasons.push(`detection confidence ${conf.toFixed(2)} (>= 0.80)`); }
  else if (conf >= 0.5) { score += 1; reasons.push(`detection confidence ${conf.toFixed(2)} (>= 0.50)`); }
  if (f.vibrationRatio && f.vibrationRatio >= cfg.vibrationRatio) { score += 2; reasons.push(`vibration ${f.vibrationRatio}x baseline (>= ${cfg.vibrationRatio}x)`); }
  if (f.rainMm24h !== null && f.rainMm24h >= cfg.rainMm) { score += 1; reasons.push(`${f.rainMm24h} mm rain in 24h (>= ${cfg.rainMm} mm)`); }
  if (f.worstRating !== null && f.worstRating <= 3) { score += 1; reasons.push(`prior inspection rating ${f.worstRating} (<= 3)`); }
  return { level: score >= cfg.highAt ? "high" : score >= cfg.mediumAt ? "medium" : "low", reasons };
}
