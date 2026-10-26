/**
 * Which data sources feed which data product. This is how ARGUS suggests sources AFTER the person
 * has picked the product. DB-free so client and server can both use it.
 */
export type SourceKind = "files" | "screen" | "sensor" | "weather";

export const SOURCE_LABEL: Record<SourceKind, string> = {
  files: "Photos or video files",
  screen: "Screen or camera share",
  sensor: "Sensor readings",
  weather: "Weather",
};

export type SourceNeed = { kind: SourceKind; why: string; required: boolean };

const SCREEN: SourceNeed[] = [
  { kind: "screen", why: "ARGUS samples frames from a shared screen or camera view and counts what it sees.", required: true },
  { kind: "files", why: "Uploaded photos and video work too.", required: false },
];

/** One source can power many products: every product that can read this kind of source. */
export const productsUsing = <P extends { id: string }>(kind: SourceKind, all: P[]) => all.filter((p) => sourcesFor(p.id).some((n) => n.kind === kind));

export type AddKind = "files" | "screen" | "weather" | "sensor_sim";
export type SourceSuggestion = { kind: AddKind; label: string; products: string[]; linked: boolean };

/** What to suggest adding, given the products in a project and what is already linked. Needed first. */
export function suggestSources(productIds: string[], linked: Record<SourceKind, boolean>, nameOf: (id: string) => string): SourceSuggestion[] {
  const need = new Map<SourceKind, string[]>();
  for (const id of productIds) for (const n of sourcesFor(id)) if (n.required || linked[n.kind]) need.set(n.kind, [...(need.get(n.kind) ?? []), nameOf(id)]);
  return [...need]
    .map(([k, names]) => ({ kind: (k === "sensor" ? "sensor_sim" : k) as AddKind, label: SOURCE_LABEL[k], products: names, linked: linked[k] }))
    .sort((a, b) => Number(a.linked) - Number(b.linked));
}

export function sourcesFor(productId: string): SourceNeed[] {
  if (productId === "people-count" || productId === "attribute-breakdown") return SCREEN;
  return [{ kind: "files", why: "ARGUS reads photos and video frames you upload.", required: true }];
}
