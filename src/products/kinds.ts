// The catalog's fixed lists, kept apart from the zod schema so browser code can read the catalog without zod.

/** Shape of the output, which decides how it is delivered. */
export const KINDS = [
  "dataset",
  "event-stream",
  "timeseries",
  "spatial-layer",
  "alert",
  "report",
  "graph",
  "forecast",
  "twin",
  "api",
] as const;

/** Transformation ladder level (see whitepaper section 2). */
export const LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;

/** What ARGUS commits to today. */
export const STATUSES = ["supported", "planned", "research"] as const;

/** Catalog groups. Products are classified by what they do, not by one source type such as vehicles. */
export const CATEGORIES = ["core", "transportation", "construction", "business", "digital", "personal", "advanced"] as const;

export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  core: "Core visual intelligence",
  transportation: "Transportation intelligence",
  construction: "Construction & infrastructure",
  business: "Business intelligence",
  digital: "Digital experience",
  personal: "Personal tracking",
  advanced: "Advanced intelligence",
};

export const OUTPUT_FORMATS = ["csv", "parquet", "geojson", "timeseries_api", "event_api", "webhook", "dashboard", "pdf"] as const;
