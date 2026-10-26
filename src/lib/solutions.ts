/**
 * A template is a group of data products that answers one outcome ("watch my bridge"). A data
 * product is the small unit (people count, density heatmap); the catalog holds those. Each template
 * lists the products it switches on and the data it needs, so ARGUS can suggest sources first.
 */
export type SourceNeed = {
  id: "photos" | "vibration" | "weather" | "inspections";
  name: string;
  why: string;
  tier: "required" | "recommended" | "optional";
  /** Certainty added to alerts when this source is present. */
  lift: number;
  /** How it gets connected today. */
  how: string;
};

export type Solution = {
  id: string;
  name: string;
  category: string;
  blurb: string;
  live: boolean;
  /** Data product ids this template switches on. */
  products: string[];
  /** Value stored in projects.kind. */
  kind: string;
  needs: SourceNeed[];
};

export const SOLUTIONS: readonly Solution[] = [
  {
    id: "bridge-monitoring",
    name: "Bridge Monitoring Alert",
    category: "Infrastructure",
    blurb: "Photos, vibration and weather joined per pier. Alerts you when damage and stress line up.",
    live: true,
    products: ["object-detection-dataset"],
    kind: "bridge",
    needs: [
      { id: "photos", name: "Photos or video of the structure", why: "ARGUS reads these to find cracks, spalling and corrosion.", tier: "required", lift: 40, how: "Upload files from the Sources page" },
      { id: "vibration", name: "Vibration or strain readings", why: "Shows whether the structure moves more than usual when damage appears.", tier: "recommended", lift: 22, how: "Simulated sensor, or a webhook from a real one" },
      { id: "weather", name: "Weather", why: "Heavy rain and freeze cycles explain why damage grows.", tier: "recommended", lift: 10, how: "Free feed by location, no account needed" },
      { id: "inspections", name: "Past inspection reports", why: "Gives each pier a rating history, so a new crack is compared with the old one.", tier: "optional", lift: 8, how: "Upload a CSV with asset, date, rating and finding" },
    ],
  },
  {
    id: "crowd-insight",
    name: "Crowd Insight",
    category: "Business",
    blurb: "Share a screen or camera view. Counts people over time and, if you opt in, gives an aggregate gender split.",
    live: true,
    products: ["people-count", "attribute-breakdown"],
    kind: "other",
    needs: [],
  },
  { id: "road-surface", name: "Road Surface Condition", category: "Infrastructure", blurb: "Potholes and cracking from dashcam and survey frames, ranked by repair urgency.", live: false, products: [], kind: "road", needs: [] },
  { id: "site-progress", name: "Site Progress Tracker", category: "Construction", blurb: "Compares drone and site photos to the plan and flags work that is falling behind.", live: false, products: [], kind: "construction", needs: [] },
  { id: "shelf-availability", name: "Shelf Availability", category: "Retail", blurb: "Counts empty shelf facings from store cameras and alerts before a stock-out.", live: false, products: [], kind: "retail", needs: [] },
  { id: "line-defects", name: "Line Defect Watch", category: "Industry", blurb: "Finds surface defects on a production line and ties them to machine readings.", live: false, products: [], kind: "factory", needs: [] },
  { id: "cold-chain", name: "Cold-chain Integrity", category: "Logistics", blurb: "Joins temperature loggers with door and dock camera events to catch breaks early.", live: false, products: [], kind: "logistics", needs: [] },
];

export function getSolution(id: string | null | undefined) {
  return SOLUTIONS.find((s) => s.id === id);
}

/** Older projects have no stored product; a bridge project is a Bridge Monitoring project. */
export function solutionOf(project: { product: string | null; kind: string }) {
  return getSolution(project.product) ?? (project.kind === "bridge" ? getSolution("bridge-monitoring") : undefined);
}
