ALTER TABLE "projects" ADD COLUMN "share_slug" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "shared_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_share_slug_unique" UNIQUE("share_slug");