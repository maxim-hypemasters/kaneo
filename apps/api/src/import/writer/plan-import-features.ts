import {
  pairKey,
  resolveFeatureHierarchy,
} from "../../task/feature-hierarchy/resolve-feature-hierarchy";
import type { PlannedImportRelation } from "./plan-import-relations";
import type { TaskType } from "../../task/task-type";

// Imported "subtask" links (Jira parents, Linear and Plane sub-issues, Kaneo
// exports) become features the same way existing ones were converted: each
// tree's top task is the feature and everything under it its tasks. Links
// that don't fit (deeper levels, extra parents, loops) stay as related ones.
export function planImportFeatures(
  relations: readonly PlannedImportRelation[],
  taskIds: readonly string[],
  taskTypes: ReadonlyMap<string, TaskType> = new Map(),
) {
  const subtasks = relations.filter(
    (relation) => relation.relationType === "subtask",
  );
  const others = relations.filter(
    (relation) => relation.relationType !== "subtask",
  );
  const plan = resolveFeatureHierarchy({
    tasks: taskIds.map((id) => ({
      id,
      type: taskTypes.get(id) ?? "task",
      featureId: null,
    })),
    // Import order stands in for age, so the source's first parent wins.
    edges: subtasks.map((relation, index) => ({
      id: String(index),
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
      createdAt: new Date(index),
    })),
    relatedPairs: new Set(
      others
        .filter((relation) => relation.relationType === "related")
        .map((relation) =>
          pairKey(relation.sourceTaskId, relation.targetTaskId),
        ),
    ),
  });
  const related = subtasks
    .filter((_, index) => plan.outcomes.get(String(index)) === "related")
    .map((relation) => ({ ...relation, relationType: "related" as const }));
  return {
    features: plan.features,
    memberships: plan.memberships,
    relations: [...others, ...related],
  };
}
