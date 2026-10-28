CREATE TABLE "lane_products" (
	"lane_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lane_products_lane_id_product_id_pk" PRIMARY KEY("lane_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "lane_products" ADD CONSTRAINT "lane_products_lane_id_source_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."source_lanes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lane_products" ADD CONSTRAINT "lane_products_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lane_products_project_idx" ON "lane_products" USING btree ("project_id");