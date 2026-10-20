ALTER TABLE "task" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "priority" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "status" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "column_id" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "priority" text DEFAULT 'no-priority' NOT NULL;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "release_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_lead_id_user_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_column_id_column_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."column"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "milestone_releaseId_idx" ON "milestone" USING btree ("release_id");--> statement-breakpoint
INSERT INTO "activity" ("id", "task_id", "type", "content", "event_data")
SELECT 'feature-planning-' || t."id", t."id", 'feature_planning_snapshot', NULL,
 jsonb_build_object('projectId', t."project_id", 'status', t."status", 'columnId', t."column_id", 'priority', t."priority", 'userId', t."assignee_id", 'startDate', t."start_date", 'dueDate', t."due_date", 'releaseId', t."release_id", 'releaseName', r."name", 'archivedAt', CASE WHEN t."status" = 'archived' THEN t."updated_at" ELSE NULL END)
FROM "task" t LEFT JOIN "release" r ON r."id" = t."release_id"
WHERE t."type" = 'feature';
--> statement-breakpoint
UPDATE "task" SET "archived_at" = CASE WHEN "status" = 'archived' THEN "updated_at" ELSE NULL END,
 "status" = NULL, "column_id" = NULL, "priority" = NULL, "assignee_id" = NULL,
 "start_date" = NULL, "due_date" = NULL, "release_id" = NULL
WHERE "type" = 'feature';
--> statement-breakpoint
UPDATE "milestone" m SET "status" = coalesce((SELECT c."slug" FROM "column" c JOIN "task" f ON f."project_id" = c."project_id" WHERE f."id" = m."feature_id" AND NOT c."is_final" ORDER BY c."position", c."id" LIMIT 1), 'planned'),
 "column_id" = (SELECT c."id" FROM "column" c JOIN "task" f ON f."project_id" = c."project_id" WHERE f."id" = m."feature_id" AND NOT c."is_final" ORDER BY c."position", c."id" LIMIT 1);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_planning_shape_check" CHECK (("task"."type" = 'feature' and "task"."status" is null and "task"."priority" is null and "task"."column_id" is null and "task"."assignee_id" is null and "task"."start_date" is null and "task"."due_date" is null and "task"."release_id" is null) or ("task"."type" in ('task', 'bug') and "task"."status" is not null and "task"."priority" is not null and "task"."archived_at" is null));
--> statement-breakpoint
CREATE FUNCTION kaneo_preserve_feature_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."type" IS DISTINCT FROM NEW."type" AND (OLD."type" = 'feature' OR NEW."type" = 'feature') THEN
  RAISE EXCEPTION 'Features cannot be converted to or from execution work' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_feature_identity BEFORE UPDATE OF "type" ON "task" FOR EACH ROW EXECUTE FUNCTION kaneo_preserve_feature_identity();
--> statement-breakpoint
CREATE FUNCTION kaneo_preserve_feature_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."type" = 'feature_planning_snapshot' AND (
   ROW(NEW."id", NEW."task_id", NEW."type", NEW."content", NEW."event_data", NEW."created_at", NEW."updated_at", NEW."external_user_name", NEW."external_user_avatar", NEW."external_source", NEW."external_url")
   IS DISTINCT FROM ROW(OLD."id", OLD."task_id", OLD."type", OLD."content", OLD."event_data", OLD."created_at", OLD."updated_at", OLD."external_user_name", OLD."external_user_avatar", OLD."external_source", OLD."external_url")
   OR (NEW."user_id" IS NOT NULL AND NEW."user_id" IS DISTINCT FROM OLD."user_id")
 ) THEN
  RAISE EXCEPTION 'Feature planning snapshots are immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER activity_feature_snapshot_immutable BEFORE UPDATE ON "activity" FOR EACH ROW EXECUTE FUNCTION kaneo_preserve_feature_snapshot();
