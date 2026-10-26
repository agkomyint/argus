ALTER TABLE "jobs" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "frequency" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "timelines" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_source_idx" ON "jobs" USING btree ("project_id","source");