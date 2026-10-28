CREATE INDEX "obs_upload_idx" ON "observations" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_lanes_project_idx" ON "source_lanes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "timelines_project_idx" ON "timelines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uploads_project_idx" ON "uploads" USING btree ("project_id","created_at" DESC NULLS LAST);