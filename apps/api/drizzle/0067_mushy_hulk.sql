ALTER TABLE "task" DROP CONSTRAINT "task_feature_shape_check";--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_feature_shape_check" CHECK ("task"."type" in ('task', 'bug', 'feature') and ("task"."type" <> 'feature' or "task"."feature_id" is null) and "task"."feature_id" <> "task"."id");
--> statement-breakpoint
-- Existing task history remains intact; bugs join the same status ledger.
CREATE OR REPLACE FUNCTION record_task_release_progress() RETURNS trigger AS $$
DECLARE recorded_at timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(OLD.project_id, OLD.release_id, OLD.status, OLD.type) IS NOT DISTINCT FROM
    ROW(NEW.project_id, NEW.release_id, NEW.status, NEW.type) THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.type IN ('task', 'bug') AND OLD.release_id IS NOT NULL THEN
    -- During project/workspace cascades the release may already be gone.
    INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
      SELECT OLD.release_id, recorded_at, OLD.status, -1
      FROM "release" WHERE id = OLD.release_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.type IN ('task', 'bug') AND NEW.release_id IS NOT NULL THEN
    INSERT INTO "release_progress_event" (release_id, recorded_at, status, delta)
      SELECT NEW.release_id, recorded_at, NEW.status, 1
      FROM "release" WHERE id = NEW.release_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
