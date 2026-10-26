ALTER TABLE "projects" ADD COLUMN "product" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "agent_level" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "monthly_photos" integer DEFAULT 2000 NOT NULL;