CREATE TABLE "consumer_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'watcher' NOT NULL,
	"reads" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule" jsonb NOT NULL,
	"on" boolean DEFAULT true NOT NULL,
	"on_timeline" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumer_apps" ADD CONSTRAINT "consumer_apps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumer_apps_project_idx" ON "consumer_apps" USING btree ("project_id");