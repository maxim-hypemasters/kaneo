CREATE TABLE "work_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"time_zone" text NOT NULL,
	"weekly_intervals" jsonb NOT NULL,
	"time_off" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "work_calendar_workspace_user_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "planning_time_zone" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "estimate_day_minutes" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "schedule_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "schedule_revision" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "schedule_applied_at" timestamp;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "estimate_seconds" integer;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "legacy_start_date" timestamp;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "legacy_due_date" timestamp;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "schedule_segments" jsonb;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "scheduled_assignee_id" text;--> statement-breakpoint
ALTER TABLE "work_calendar" ADD CONSTRAINT "work_calendar_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_calendar" ADD CONSTRAINT "work_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_scheduled_assignee_id_user_id_fk" FOREIGN KEY ("scheduled_assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_estimate_shape_check" CHECK ("task"."estimate_seconds" is null or ("task"."type" in ('task', 'bug') and "task"."estimate_seconds" > 0 and "task"."estimate_seconds" % 60 = 0));
--> statement-breakpoint
UPDATE "task" SET "legacy_start_date" = "start_date", "legacy_due_date" = "due_date", "scheduled_assignee_id" = "assignee_id" WHERE "type" IN ('task', 'bug');
--> statement-breakpoint
INSERT INTO "activity" ("id", "task_id", "type", "event_data")
SELECT 'legacy-schedule-' || md5("id"), "id", 'schedule_preserved', jsonb_build_object('startDate', "start_date", 'dueDate', "due_date", 'source', 'manual')
FROM "task" WHERE "type" IN ('task', 'bug') AND ("start_date" IS NOT NULL OR "due_date" IS NOT NULL);
