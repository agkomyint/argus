CREATE INDEX "alerts_project_idx" ON "alerts" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "obs_project_time_idx" ON "observations" USING btree ("project_id","event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "obs_asset_time_idx" ON "observations" USING btree ("asset_id","event_time");--> statement-breakpoint
CREATE INDEX "obs_type_idx" ON "observations" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "sources_project_idx" ON "sources" USING btree ("project_id");