export const PROJECT_KINDS = [
  { id: "bridge", label: "Bridge" },
  { id: "road", label: "Road & traffic" },
  { id: "construction", label: "Construction site" },
  { id: "retail", label: "Retail" },
  { id: "factory", label: "Factory" },
  { id: "logistics", label: "Logistics" },
  { id: "other", label: "Other" },
] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number]["id"];

export function kindLabel(kind: string) {
  return PROJECT_KINDS.find((k) => k.id === kind)?.label ?? kind;
}
