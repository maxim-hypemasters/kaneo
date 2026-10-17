import type { RelationPickerMode } from "./task-relation-picker-store";

export type RelationLinkMode = Exclude<RelationPickerMode, "feature">;

type RelationEdge = {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

// Feature membership also arrives as "subtask" relations (for older
// clients); it is shown and changed through the feature, not as a relation.
export const isTaskRelation = (relation: RelationEdge) =>
  relation.relationType !== "subtask";

export function buildRelationLink(
  mode: RelationLinkMode,
  taskId: string,
  pickedTaskId: string,
) {
  if (mode === "blockedBy") {
    return {
      sourceTaskId: pickedTaskId,
      targetTaskId: taskId,
      relationType: "blocks" as const,
    };
  }
  return {
    sourceTaskId: taskId,
    targetTaskId: pickedTaskId,
    relationType: mode,
  };
}

// The task itself and the tasks it's already related to.
export function unpickableTaskIds(taskId: string, relations: RelationEdge[]) {
  const ids = new Set([taskId]);
  for (const relation of relations.filter(isTaskRelation)) {
    ids.add(relation.sourceTaskId);
    ids.add(relation.targetTaskId);
  }
  return ids;
}
