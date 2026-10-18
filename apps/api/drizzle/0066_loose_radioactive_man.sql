CREATE TABLE "project_workflow_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"column_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"position" integer NOT NULL,
	"is_final" boolean NOT NULL,
	"present" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_progress_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text,
	"delta" integer NOT NULL,
	CONSTRAINT "release_progress_event_baseline_check" CHECK ("release_progress_event"."status" is not null or "release_progress_event"."delta" = 0)
);
--> statement-breakpoint
ALTER TABLE "project_workflow_history" ADD CONSTRAINT "project_workflow_history_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_progress_event" ADD CONSTRAINT "release_progress_event_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_workflow_history_project_time_idx" ON "project_workflow_history" USING btree ("project_id","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_progress_event_baseline_idx" ON "release_progress_event" USING btree ("release_id") WHERE "release_progress_event"."status" is null;--> statement-breakpoint
CREATE INDEX "release_progress_event_release_time_idx" ON "release_progress_event" USING btree ("release_id","recorded_at","id");
--> statement-breakpoint
-- Hold writers until the baseline and all capture triggers are installed.
-- The migration runner executes these statements in one transaction.
LOCK TABLE "task", "column", "release" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE baseline_at timestamptz := clock_timestamp();
BEGIN
  INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
    SELECT id, baseline_at, NULL, 0 FROM "release";

  INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
    SELECT task.release_id, baseline_at, task.status, count(*)::integer
    FROM "task" AS task
    INNER JOIN "release" AS release
      ON release.id = task.release_id AND release.project_id = task.project_id
    WHERE task.type = 'task'
    GROUP BY task.release_id, task.status;

  INSERT INTO "project_workflow_history"
    (project_id, column_id, recorded_at, slug, position, is_final, present)
    SELECT project_id, id, baseline_at, slug, position, is_final, true
    FROM "column";
END;
$$;
--> statement-breakpoint
CREATE FUNCTION record_release_progress_baseline() RETURNS trigger AS $$
BEGIN
  INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
    VALUES (NEW.id, clock_timestamp(), NULL, 0);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER release_progress_baseline AFTER INSERT ON "release"
  FOR EACH ROW EXECUTE FUNCTION record_release_progress_baseline();
--> statement-breakpoint
-- Record raw status deltas, without reading or locking an aggregate row.
-- This covers every writer and keeps bulk edits from contending on a release.
CREATE FUNCTION record_task_release_progress() RETURNS trigger AS $$
DECLARE recorded_at timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(OLD.project_id, OLD.release_id, OLD.status, OLD.type) IS NOT DISTINCT FROM
    ROW(NEW.project_id, NEW.release_id, NEW.status, NEW.type) THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.type = 'task' AND OLD.release_id IS NOT NULL THEN
    -- During project/workspace cascades the release may already be gone.
    INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
      SELECT OLD.release_id, recorded_at, OLD.status, -1
      FROM "release" WHERE id = OLD.release_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.type = 'task' AND NEW.release_id IS NOT NULL THEN
    INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
      SELECT NEW.release_id, recorded_at, NEW.status, 1
      FROM "release" WHERE id = NEW.release_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER task_release_progress AFTER INSERT OR UPDATE OR DELETE ON "task"
  FOR EACH ROW EXECUTE FUNCTION record_task_release_progress();
--> statement-breakpoint
CREATE FUNCTION record_project_workflow_history() RETURNS trigger AS $$
DECLARE recorded_at timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(OLD.project_id, OLD.slug, OLD.position, OLD.is_final) IS NOT DISTINCT FROM
    ROW(NEW.project_id, NEW.slug, NEW.position, NEW.is_final) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' OR
    (TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id) THEN
    -- Keep deleted columns' history, but do not recreate it during cascades.
    INSERT INTO "project_workflow_history"
      (project_id, column_id, recorded_at, slug, position, is_final, present)
      SELECT OLD.project_id, OLD.id, recorded_at, OLD.slug, OLD.position,
        OLD.is_final, false
      FROM "project" WHERE id = OLD.project_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    INSERT INTO "project_workflow_history"
      (project_id, column_id, recorded_at, slug, position, is_final, present)
      SELECT NEW.project_id, NEW.id, recorded_at, NEW.slug, NEW.position,
        NEW.is_final, true
      FROM "project" WHERE id = NEW.project_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER column_workflow_history AFTER INSERT OR UPDATE OR DELETE ON "column"
  FOR EACH ROW EXECUTE FUNCTION record_project_workflow_history();
