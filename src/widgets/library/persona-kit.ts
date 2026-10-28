import { PERSONAS, personaName } from "@/lib/personas";
import { PALETTE } from "@/widgets/kit";
import type { FlatRow } from "@/widgets/schema";

// Shared by the persona widgets so each simulated visitor keeps one colour everywhere.
const COLORS = [PALETTE[0], PALETTE[1], PALETTE[3], PALETTE[4]];

export const personaColor = (id: unknown) => {
  const i = PERSONAS.findIndex((p) => p.id === id);
  return COLORS[(i < 0 ? PERSONAS.length : i) % COLORS.length];
};

export const personaLabel = (r: FlatRow) => (typeof r.persona_name === "string" && r.persona_name ? r.persona_name : personaName(String(r.persona ?? "")));

/** Rows of one screenshot belong together; the upload id is the key, the file name the fallback. */
export const screenKey = (r: FlatRow) => String(r.upload_id ?? r.file ?? r.screen ?? "");

export const screenName = (r: FlatRow) => String(r.page ?? r.screen ?? r.file ?? "Screen");

export const SEVERITY = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITY)[number];
export const severityOf = (r: FlatRow): Severity => (SEVERITY.includes(r.severity as Severity) ? (r.severity as Severity) : "low");
export const SEVERITY_TONE: Record<Severity, string> = { high: "var(--destructive)", medium: "var(--chart-4)", low: "var(--muted-foreground)" };

export type Point = { label?: string; x: number; y: number; weight?: number };
export const pointsOf = (v: unknown): Point[] =>
  Array.isArray(v) ? v.filter((p): p is Point => !!p && typeof p === "object" && Number.isFinite(Number((p as Point).x)) && Number.isFinite(Number((p as Point).y))) : [];

export const stat = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
