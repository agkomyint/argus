import { z } from "zod";
import { widgetUseSchema } from "@/widgets/schema";

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
export const CATEGORIES = ["core", "transportation", "construction", "business", "advanced"] as const;

export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  core: "Core visual intelligence",
  transportation: "Transportation intelligence",
  construction: "Construction & infrastructure",
  business: "Business intelligence",
  advanced: "Advanced intelligence",
};

export const OUTPUT_FORMATS = ["csv", "parquet", "geojson", "timeseries_api", "event_api", "webhook", "dashboard", "pdf"] as const;

export const kindSchema = z.enum(KINDS);
export const levelSchema = z.enum(LEVELS);
export const statusSchema = z.enum(STATUSES);
export const categorySchema = z.enum(CATEGORIES);
export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case id");

const fieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "integer", "boolean", "timestamp", "geometry", "json"]),
  unit: z.string().optional(),
  description: z.string(),
});

const paramSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
});

/**
 * A product manifest declares what a data product is, what it needs and what it promises.
 * It mirrors the six attributes in the whitepaper (identity, contract, evidence, quality,
 * operations, access) plus a support status.
 */
export const productManifestSchema = z.object({
  // Identity
  id: idSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver"),
  name: z.string(),
  summary: z.string(),
  /** Catalog number, stable once published. */
  no: z.number().int().positive(),
  category: categorySchema,
  owner: z.string(),

  // Classification
  kind: kindSchema,
  level: levelSchema,
  status: statusSchema,

  // Contract
  /** Upstream product ids this product is computed from. Empty means it reads raw observations. */
  inputs: z.array(idSchema),
  /** Observation types consumed when `inputs` is empty. */
  observationTypes: z.array(z.string()).default([]),
  params: z.array(paramSchema).default([]),
  schema: z.array(fieldSchema),
  time: z.enum(["event-time", "processing-time"]).default("event-time"),
  /** Coordinate frame of any geometry, or null when the product has none. */
  crs: z.enum(["image_pixel", "wgs84"]).nullable().default(null),

  // Evidence + quality
  evidence: z.enum(["clip-per-event", "frame-per-event", "aggregate-only", "none"]),
  quality: z.array(z.string()),
  limitations: z.array(z.string()),

  // Operations
  refresh: z.enum(["continuous", "hourly", "daily", "on-demand"]),
  outputs: z.array(outputFormatSchema),

  // Access
  privacy: z.enum(["no-person-identification", "aggregate-only", "access-controlled-clips"]),
  requiresHumanReview: z.boolean().default(false),

  // Presentation: the one widget this product is shown with. Omit to use the default for its kind.
  widget: widgetUseSchema.optional(),
});

/** Input shape (before defaults); this is what manifest files are written as. */
export type ProductManifestInput = z.input<typeof productManifestSchema>;
export type ProductManifest = z.output<typeof productManifestSchema>;
export type ProductKind = z.infer<typeof kindSchema>;
export type ProductLevel = z.infer<typeof levelSchema>;
export type ProductStatus = z.infer<typeof statusSchema>;
export type ProductCategory = z.infer<typeof categorySchema>;
