-- Link every existing lane to the enabled products its analyzer can feed, so products keep reading the same rows
-- now that links decide what each product reads. Pairs come from src/lib/setup-rules.ts (analyzerFor).
INSERT INTO "lane_products" ("lane_id", "project_id", "product_id")
SELECT l."id", l."project_id", pp."product_id"
FROM "source_lanes" l
JOIN "project_products" pp ON pp."project_id" = l."project_id"
JOIN (VALUES
  ('objects', 'object-detection-dataset'),
  ('objects', 'density-heatmap'),
  ('objects', 'vehicle-traffic-dashboard'),
  ('objects', 'road-safety-event-feed'),
  ('objects', 'people-count'),
  ('objects', 'attribute-breakdown'),
  ('screen', 'persona-perception-map'),
  ('screen', 'persona-agreement'),
  ('screen', 'friction-log'),
  ('body', 'body-progress'),
  ('body', 'body-compare'),
  ('body', 'checkin-streak')
) AS feeds(analyzer, product_id) ON feeds.analyzer = l."analyzer" AND feeds.product_id = pp."product_id"
ON CONFLICT DO NOTHING;
