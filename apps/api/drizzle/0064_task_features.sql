CREATE TABLE "legacy_subtask_relation" (
	"id" text PRIMARY KEY NOT NULL,
	"source_task_id" text NOT NULL,
	"target_task_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"outcome" text NOT NULL,
	"converted_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "type" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "feature_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_feature_id_task_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_featureId_idx" ON "task" USING btree ("feature_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_feature_shape_check" CHECK ("task"."type" in ('task', 'feature') and ("task"."type" = 'task' or "task"."feature_id" is null) and "task"."feature_id" <> "task"."id");