-- Undoes the Feature / Task conversion (feature-hierarchy.ts), for going back
-- to a Kaneo version that has subtasks instead. Stop every Kaneo server, back
-- up the database, run this file once, then start the older version.
--
-- Subtask links come back as they were before the upgrade, and every feature
-- membership made since becomes a subtask link as well, so nothing made with
-- features is lost. A task taken out of a feature after the upgrade gets its
-- old parent back. Upgrading again later converts the subtasks again, with a
-- fresh backup, so this file can undo that upgrade too.
BEGIN;

-- Rows that were kept as related links turn back into subtask links.
UPDATE task_relation AS relation
SET relation_type = 'subtask'
FROM legacy_subtask_relation AS legacy
WHERE legacy.id = relation.id
  AND legacy.outcome = 'related'
  AND relation.relation_type = 'related';

-- Rows that were removed come back, where both tasks still exist.
INSERT INTO task_relation (id, source_task_id, target_task_id, relation_type, created_at)
SELECT legacy.id, legacy.source_task_id, legacy.target_task_id, 'subtask', legacy.created_at
FROM legacy_subtask_relation AS legacy
WHERE legacy.outcome IN ('membership', 'dropped')
  AND EXISTS (SELECT 1 FROM task WHERE task.id = legacy.source_task_id)
  AND EXISTS (SELECT 1 FROM task WHERE task.id = legacy.target_task_id)
ON CONFLICT (id) DO NOTHING;

-- Memberships made since the upgrade become subtask links too. A member the
-- links above already put under its feature (say a sub-task the conversion
-- flattened into its epic) needs none.
WITH RECURSIVE under_feature (feature_id, task_id) AS (
  SELECT relation.source_task_id, relation.target_task_id
  FROM task_relation AS relation
  WHERE relation.relation_type = 'subtask'
    AND relation.source_task_id IN (
      SELECT feature_id FROM task WHERE feature_id IS NOT NULL
    )
  UNION
  SELECT under_feature.feature_id, relation.target_task_id
  FROM under_feature
  JOIN task_relation AS relation
    ON relation.source_task_id = under_feature.task_id
   AND relation.relation_type = 'subtask'
)
INSERT INTO task_relation (id, source_task_id, target_task_id, relation_type, created_at)
SELECT 'feature-undo-' || member.feature_id || '-' || member.id,
  member.feature_id, member.id, 'subtask', now() AT TIME ZONE 'utc'
FROM task AS member
WHERE member.feature_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM under_feature
    WHERE under_feature.feature_id = member.feature_id
      AND under_feature.task_id = member.id
  )
ON CONFLICT (id) DO NOTHING;

UPDATE task SET feature_id = NULL WHERE feature_id IS NOT NULL;
UPDATE task SET type = 'task' WHERE type <> 'task';

-- Every link is back, so a later upgrade backs up what it converts afresh.
DELETE FROM legacy_subtask_relation;

COMMIT;
