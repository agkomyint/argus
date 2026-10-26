-- Tag jobs queued before jobs.source existed, so every source shows its own progress.
UPDATE "jobs" SET "source" = 'src:' || ("payload"->>'sourceId') WHERE "source" IS NULL AND "kind" = 'poll_source' AND "payload" ? 'sourceId';--> statement-breakpoint
UPDATE "jobs" j SET "source" = CASE WHEN u."timeline_id" IS NULL THEN 'files' ELSE 'tl:' || u."timeline_id" END FROM "uploads" u WHERE j."source" IS NULL AND j."kind" = 'process_upload' AND u."id"::text = j."payload"->>'uploadId';--> statement-breakpoint
UPDATE "jobs" SET "source" = 'screen' WHERE "source" IS NULL AND "kind" = 'analyze_frame';
