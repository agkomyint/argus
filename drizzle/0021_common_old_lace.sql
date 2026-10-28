ALTER TABLE "source_lanes" ADD COLUMN "input" text DEFAULT 'files' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_lanes" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "source_lanes" ADD CONSTRAINT "source_lanes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Every input now goes through a lane. Give each live source that has no lane its own, named after it.
INSERT INTO "timelines" ("project_id", "name")
SELECT DISTINCT s."project_id", 'Lanes' FROM "sources" s
WHERE NOT EXISTS (SELECT 1 FROM "timelines" t WHERE t."project_id" = s."project_id");--> statement-breakpoint
INSERT INTO "source_lanes" ("project_id", "timeline_id", "name", "note", "analyzer", "input", "source_id")
SELECT s."project_id",
  (SELECT t."id" FROM "timelines" t WHERE t."project_id" = s."project_id" ORDER BY t."created_at" LIMIT 1),
  s."name", '', 'objects', s."kind", s."id"
FROM "sources" s
WHERE s."kind" IN ('screen', 'weather', 'sensor_sim', 'webhook')
  AND NOT EXISTS (SELECT 1 FROM "source_lanes" l WHERE l."source_id" = s."id");--> statement-breakpoint
-- A screen lane feeds the products that read a shared screen (src/lib/product-sources.ts).
INSERT INTO "lane_products" ("lane_id", "project_id", "product_id")
SELECT l."id", l."project_id", pp."product_id"
FROM "source_lanes" l
JOIN "project_products" pp ON pp."project_id" = l."project_id"
WHERE l."input" = 'screen' AND pp."product_id" IN ('people-count', 'attribute-breakdown')
ON CONFLICT DO NOTHING;
