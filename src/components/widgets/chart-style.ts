export const TICK = { fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono, monospace)" } as const;

export const TOOLTIP = {
  contentStyle: { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 },
  cursor: { stroke: "var(--border)" },
} as const;
