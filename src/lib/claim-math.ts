// Claims against evidence. A model reads what was said and what was seen and proposes a verdict with the
// evidence it relied on. Code decides what stands: a verdict without real, cited evidence is "not shown".

export type Verdict = "supported" | "contradicted" | "unverifiable";
export type Proposal = { turn: string; claim: string; quote: string; verdict: Verdict; evidence: string[]; reason: string };
export type Status = "shown" | "contradicted" | "not shown";
export type Checked = Proposal & { status: Status; evidence: string[]; downgraded: boolean };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Check proposals against the turns that were really said and the evidence that really exists.
 * Dropped: a turn that does not exist, or a quote that is not in that turn. Kept but weakened: a "supported" or
 * "contradicted" verdict that cites no real evidence becomes "not shown".
 */
export function checkClaims(proposals: readonly Proposal[], turns: ReadonlyMap<string, string>, evidence: ReadonlySet<string>): { kept: Checked[]; dropped: { claim: string; why: string }[] } {
  const kept: Checked[] = [];
  const dropped: { claim: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const p of proposals) {
    const said = turns.get(p.turn);
    if (said === undefined) { dropped.push({ claim: p.claim, why: "no such turn" }); continue; }
    if (!p.quote.trim() || !norm(said).includes(norm(p.quote))) { dropped.push({ claim: p.claim, why: "quote is not in the turn" }); continue; }
    const key = `${p.turn}|${norm(p.claim)}`;
    if (seen.has(key)) { dropped.push({ claim: p.claim, why: "repeat" }); continue; }
    seen.add(key);
    const real = [...new Set(p.evidence.filter((e) => evidence.has(e)))];
    const status: Status = p.verdict === "supported" && real.length ? "shown" : p.verdict === "contradicted" && real.length ? "contradicted" : "not shown";
    kept.push({ ...p, evidence: real, status, downgraded: p.verdict !== "unverifiable" && status === "not shown" });
  }
  return { kept, dropped };
}

/** Counts per status, for a summary line. */
export function tally(items: readonly { status: Status }[]): Record<Status, number> {
  const t: Record<Status, number> = { shown: 0, contradicted: 0, "not shown": 0 };
  for (const i of items) t[i.status]++;
  return t;
}
