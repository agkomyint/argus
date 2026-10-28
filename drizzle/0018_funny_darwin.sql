ALTER TABLE "source_lanes" ADD COLUMN "analyzer" text DEFAULT 'objects' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "taken_on" date;