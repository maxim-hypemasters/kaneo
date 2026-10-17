import { Effect } from "effect";
import {
  taskTypeOf,
  updateTaskFeature,
  updateTaskType,
} from "../api/task-features.js";
import { InvalidArgument } from "../errors/errors.js";
import { notAFeature } from "../tasks/resolve-feature.js";
import type { ResolvedTask } from "../tasks/resolve-task.js";
import { taskArgument, taskLabel, taskRef } from "./task-ref.js";

// The deprecated "child subtask-of parent": the child joins the parent's
// feature, as a "subtask" relation does on the server. The parent is that
// feature, or the feature it is in; a plain task in no feature becomes a
// feature first. Checks run before that, so a failed link changes nothing.
export const joinParentFeature = Effect.fn("relations.joinParentFeature")(
  function* (parent: ResolvedTask, child: ResolvedTask) {
    const childLabel = taskLabel(taskRef(child));
    const parentLabel = taskLabel(taskRef(parent));
    if (parent.task.type === undefined) return yield* notAFeature(parent);
    const isFeature = taskTypeOf(parent.task) === "feature";
    const featureId = isFeature
      ? parent.task.id
      : (parent.task.featureId ?? parent.task.id);
    const madeFeature = !isFeature && featureId === parent.task.id;
    if (taskTypeOf(child.task) === "feature") {
      return yield* new InvalidArgument({
        message: `${childLabel} is a feature, and a feature can't belong to one.`,
        hint: `Make it a task first with kaneo task edit ${taskArgument(taskRef(child))} --type task.`,
      });
    }
    if (child.task.projectId !== parent.task.projectId) {
      return yield* new InvalidArgument({
        message: `${childLabel} and ${parentLabel} are in different projects.`,
        hint: "A task can only belong to a feature in its own project.",
      });
    }
    if (child.task.featureId === featureId) {
      return yield* new InvalidArgument({
        message: `${childLabel} is already in this feature.`,
        hint: `Run kaneo task relation list ${childLabel} to see its feature.`,
      });
    }
    if (madeFeature) yield* updateTaskType(parent.task.id, "feature");
    yield* updateTaskFeature(child.task.id, featureId);
    return { featureId, madeFeature };
  },
);
