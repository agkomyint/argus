// Turns a model's frame-number proposals into verified incidents. The model points; code decides what counts.

export type Proposal = { frame: number; kind: string; description: string; confidence: number };
export type Incident = Proposal & { atMs: number };

/**
 * Keep proposals that name a real frame, give each a time from that frame, drop repeats of the same kind within
 * `withinMs` (the model often lists one crash on three frames), and return them in time order.
 */
export function verifyIncidents(proposals: readonly Proposal[], times: readonly number[], { withinMs = 4000, minConfidence = 0.3 } = {}): { kept: Incident[]; dropped: { frame: number; why: string }[] } {
  const kept: Incident[] = [];
  const dropped: { frame: number; why: string }[] = [];
  const sorted = [...proposals].sort((a, b) => a.frame - b.frame);
  for (const p of sorted) {
    if (!Number.isInteger(p.frame) || p.frame < 1 || p.frame > times.length) { dropped.push({ frame: p.frame, why: "no such frame" }); continue; }
    if (p.confidence < minConfidence) { dropped.push({ frame: p.frame, why: "low confidence" }); continue; }
    const atMs = times[p.frame - 1];
    if (kept.some((k) => k.kind === p.kind && Math.abs(k.atMs - atMs) <= withinMs)) { dropped.push({ frame: p.frame, why: "repeat" }); continue; }
    kept.push({ ...p, atMs });
  }
  return { kept: kept.sort((a, b) => a.atMs - b.atMs), dropped };
}

/** Evenly pick at most `max` indexes from `n` items, always keeping the first and last. */
export function spread(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  return Array.from(new Set(Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)))));
}
