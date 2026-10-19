import type { ImportedRelation, ImportedTask } from "@kaneo/importers";
import {
  pairKey,
  resolveFeatureHierarchy,
} from "../../task/feature-hierarchy/resolve-feature-hierarchy";
import { planTransferHierarchy } from "../../task/transfers/hierarchy";
import { planImportFeatures } from "./plan-import-features";
import {
  planImportRelations,
  type PlannedImportRelation,
} from "./plan-import-relations";

type SourceTask = Pick<ImportedTask, "key" | "type" | "featureKey">;

// Explicit source membership wins before legacy edges can promote any parent.
// Omitted fields still use the legacy tree-flattening behavior.
export function planImportHierarchy(
  tasks: readonly SourceTask[],
  taskIds: ReadonlyMap<string, string>,
  sourceRelations: readonly ImportedRelation[],
) {
  const explicit = planTransferHierarchy(
    tasks.map(({ key, type, featureKey }) => ({ key, type, featureKey })),
    [],
  ).memberships;
  if (tasks.every((task) => task.featureKey === undefined)) {
    return planImportFeatures(
      planImportRelations(sourceRelations, taskIds),
      tasks.map((task) => taskIds.get(task.key)!),
      new Map(
        tasks.map((task) => [taskIds.get(task.key)!, task.type ?? "task"]),
      ),
    );
  }
  const sourceById = new Map(
    tasks.map((task) => [taskIds.get(task.key)!, task]),
  );
  const mapped = planImportRelations(sourceRelations, taskIds);
  const relations = mapped.filter(
    (relation) => relation.relationType !== "subtask",
  );
  const relatedPairs = new Set(
    relations
      .filter((relation) => relation.relationType === "related")
      .map((relation) => pairKey(relation.sourceTaskId, relation.targetTaskId)),
  );
  const addRelated = (relation: PlannedImportRelation) => {
    const pair = pairKey(relation.sourceTaskId, relation.targetTaskId);
    if (relatedPairs.has(pair)) return;
    relatedPairs.add(pair);
    relations.push({ ...relation, relationType: "related" });
  };
  const legacy: PlannedImportRelation[] = [];
  for (const relation of mapped.filter(
    (relation) => relation.relationType === "subtask",
  )) {
    const target = sourceById.get(relation.targetTaskId)!;
    if (target.featureKey === undefined) {
      legacy.push(relation);
      continue;
    }
    const explicitOwner = target.featureKey
      ? taskIds.get(target.featureKey)
      : null;
    if (explicitOwner !== relation.sourceTaskId) addRelated(relation);
  }
  const plan = resolveFeatureHierarchy({
    tasks: tasks.map((task) => ({
      id: taskIds.get(task.key)!,
      type: task.type ?? "task",
      featureId: explicit.has(task.key)
        ? taskIds.get(explicit.get(task.key)!)!
        : null,
    })),
    edges: legacy.map((relation, index) => ({
      id: String(index),
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
      createdAt: new Date(index),
    })),
    relatedPairs,
  });
  for (const [index, relation] of legacy.entries()) {
    if (plan.outcomes.get(String(index)) === "related") addRelated(relation);
  }
  return { features: plan.features, memberships: plan.memberships, relations };
}
