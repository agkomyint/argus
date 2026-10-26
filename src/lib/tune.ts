import { AGENT_LEVELS } from "@/lib/agent-levels";

/**
 * The second dial: how often the agents look. It sets the screen-share sampling interval, which is
 * what drives the bill. DB-free so the tune control can show estimates as the dials move.
 */
export const FREQUENCIES = [
  { seconds: 5, label: "Every 5 s" },
  { seconds: 10, label: "Every 10 s" },
  { seconds: 30, label: "Every 30 s" },
  { seconds: 60, label: "Every minute" },
] as const;

export const DEFAULT_FREQUENCY = 10;

export const frequencyIndex = (seconds: number) => {
  const i = FREQUENCIES.findIndex((f) => f.seconds === seconds);
  return i < 0 ? 1 : i;
};

/** Cost per hour of one live source at this setting. Planning estimate from the level's price per 100 items. */
export function estimate(level: number, seconds: number) {
  const l = AGENT_LEVELS[Math.min(Math.max(level, 0), AGENT_LEVELS.length - 1)];
  const perHour = 3600 / seconds;
  return { cost: (l.costPer100 / 100) * perHour, accuracy: l.accuracy, seconds: l.seconds, perHour, level: l.name };
}
