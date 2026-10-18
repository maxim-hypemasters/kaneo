import type { Effect } from "effect";
import type { KaneoApi } from "../api/kaneo-api.js";
import { updateTaskFeature } from "../api/task-features.js";
import {
  deleteTaskRelation,
  type TaskRelation,
} from "../api/task-relations.js";
import type { ApiFailure } from "../errors/errors.js";

// A listed "subtask" relation with a "feature:" id is a task's feature link
// (the target is the task), so removing it takes the task out of its feature.
// Servers from before features list real subtask relations, deleted as such.
// The return type is spelled out: inferred from the two branches, callers'
// generics pick one branch's result depending on the order TypeScript met
// their types in.
export const unlinkRelation = (
  relation: TaskRelation,
): Effect.Effect<unknown, ApiFailure, KaneoApi> =>
  relation.relationType === "subtask" && relation.id.startsWith("feature:")
    ? updateTaskFeature(relation.targetTaskId, null)
    : deleteTaskRelation(relation.id);
