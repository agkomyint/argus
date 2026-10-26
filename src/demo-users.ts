// Seeded by `bun run db:seed`. The password is public on purpose: these accounts only hold demo data.
export const DEMO_PASSWORD = "argus-demo-2026";

export const DEMO_USERS = [
  { email: "maya@demo.argus.dev", name: "Maya Chen", role: "Bridge inspection lead", project: { name: "Harbor Bridge monitoring", kind: "bridge" } },
  { email: "omar@demo.argus.dev", name: "Omar Haddad", role: "Traffic operations", project: { name: "Downtown corridor traffic", kind: "road" } },
  { email: "lena@demo.argus.dev", name: "Lena Petrov", role: "Site safety manager", project: { name: "Tower B construction site", kind: "construction" } },
] as const;
