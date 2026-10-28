import { z } from "zod";
import { widgetUseSchema } from "@/widgets/schema";
import { CATEGORIES, KINDS, LEVELS, OUTPUT_FORMATS, STATUSES } from "./kinds";

export * from "./kinds";

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
