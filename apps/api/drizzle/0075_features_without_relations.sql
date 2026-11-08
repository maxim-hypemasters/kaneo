CREATE FUNCTION kaneo_reject_feature_relation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "task" WHERE "id" IN (NEW."source_task_id", NEW."target_task_id") AND "type" = 'feature') THEN
  RAISE EXCEPTION 'Features do not have relations' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_relation_without_features BEFORE INSERT OR UPDATE OF "source_task_id", "target_task_id" ON "task_relation" FOR EACH ROW EXECUTE FUNCTION kaneo_reject_feature_relation();
--> statement-breakpoint
DELETE FROM "task_relation" r WHERE EXISTS (SELECT 1 FROM "task" t WHERE t."type" = 'feature' AND t."id" IN (r."source_task_id", r."target_task_id"));
