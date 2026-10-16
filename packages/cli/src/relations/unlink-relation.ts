import { updateTaskFeature } from "../api/task-features.js";
import {
  deleteTaskRelation,
  type TaskRelation,
} from "../api/task-relations.js";

// A listed "subtask" relation with a "feature:" id is a task's feature link
// (the target is the task), so removing it takes the task out of its feature.
// Servers from before features list real subtask relations, deleted as such.
export const unlinkRelation = (relation: TaskRelation) =>
  relation.relationType === "subtask" && relation.id.startsWith("feature:")
    ? updateTaskFeature(relation.targetTaskId, null)
    : deleteTaskRelation(relation.id);
