CREATE TABLE "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "milestone_id" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_feature_id_task_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "milestone_featureId_position_idx" ON "milestone" USING btree ("feature_id","position","id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_milestoneId_idx" ON "task" USING btree ("milestone_id");