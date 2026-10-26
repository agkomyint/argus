/**
 * Props for a ResponsiveContainer that fills its box. Recharts starts at -1×-1 until it measures the box and
 * warns on that first render; starting at 1×1 skips the warning, and the real size replaces it at once.
 */
export const FILL = { width: "100%", height: "100%", minWidth: 0, initialDimension: { width: 1, height: 1 } } as const;

export const TICK = { fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono, monospace)" } as const;

export const TOOLTIP = {
  contentStyle: { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 },
  cursor: { stroke: "var(--border)" },
} as const;
