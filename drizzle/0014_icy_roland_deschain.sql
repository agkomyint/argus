ALTER TABLE "chats" DROP CONSTRAINT "chats_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;