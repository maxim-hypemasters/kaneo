CREATE TABLE "project_triage_member" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "project_triage_member_project_user_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "project_triage_member" ADD CONSTRAINT "project_triage_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_triage_member" ADD CONSTRAINT "project_triage_member_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_triage_member_userId_idx" ON "project_triage_member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- "triage" is now a reserved status for work waiting for review. Columns that
-- already used the slug keep their name and cards under "triage-column".
UPDATE "task" SET "status" = CASE WHEN EXISTS (SELECT 1 FROM "column" WHERE "column"."project_id" = "task"."project_id" AND "column"."slug" = 'triage') THEN 'triage-column' ELSE 'planned' END WHERE "status" = 'triage';--> statement-breakpoint
UPDATE "project_workflow_history" SET "slug" = 'triage-column' WHERE "slug" = 'triage';--> statement-breakpoint
UPDATE "release_progress_event" SET "status" = 'triage-column' WHERE "status" = 'triage';--> statement-breakpoint
UPDATE "column" SET "slug" = 'triage-column' WHERE "slug" = 'triage';
