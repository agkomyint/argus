/**
 * Cost vs accuracy presets for the agent pipeline. The user picks one level; each agent's
 * settings follow from it. `maxClaims`, `detail` and `strict` are applied by the orchestrator.
 * `costPer100` and `accuracy` are planning estimates, not measurements.
 */
export type AgentLevel = {
  name: string;
  costPer100: number;
  accuracy: number;
  seconds: number;
  maxClaims: number;
  detail: "short" | "standard" | "detailed";
  /** Strict verification also rejects claims that quote digits without listing them in `numbers`. */
  strict: boolean;
  summary: string;
};

export const AGENT_LEVELS: readonly AgentLevel[] = [
  { name: "Lean", costPer100: 0.4, accuracy: 71, seconds: 20, maxClaims: 3, detail: "short", strict: false, summary: "Short brief, three claims at most" },
  { name: "Light", costPer100: 0.9, accuracy: 80, seconds: 35, maxClaims: 4, detail: "short", strict: false, summary: "Short brief, four claims" },
  { name: "Balanced", costPer100: 1.8, accuracy: 87, seconds: 55, maxClaims: 6, detail: "standard", strict: false, summary: "Standard brief, six claims" },
  { name: "Careful", costPer100: 3.2, accuracy: 92, seconds: 90, maxClaims: 8, detail: "detailed", strict: true, summary: "Detailed brief, strict claim check" },
  { name: "Maximum", costPer100: 5.5, accuracy: 95, seconds: 150, maxClaims: 8, detail: "detailed", strict: true, summary: "Detailed brief, strict claim check, every finding" },
];

export const VOLUMES = [500, 2000, 10000] as const;

export function agentLevel(i: number): AgentLevel {
  return AGENT_LEVELS[Math.min(Math.max(i, 0), AGENT_LEVELS.length - 1)];
}

export function money(n: number) {
  return "$" + (n < 10 ? n.toFixed(2) : Math.round(n).toString());
}
