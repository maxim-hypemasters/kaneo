import { Effect, Option, Result } from "effect";
import { taskTypeOf } from "../api/task-features.js";
import { InvalidArgument } from "../errors/errors.js";
import { withSpinner } from "../output/spinner.js";
import { taskArgument, taskLabel, taskRef } from "../relations/task-ref.js";
import { type ResolvedTask, resolveTask } from "./resolve-task.js";

export function notAFeature(task: ResolvedTask): InvalidArgument {
  return new InvalidArgument({
    message: `${taskLabel(taskRef(task))} is not a feature.`,
    hint:
      task.task.type === undefined
        ? "This Kaneo server has no features yet. Update it, then try again."
        : `Make it one with kaneo task edit ${taskArgument(taskRef(task))} --type feature, or pass a feature.`,
  });
}

// The feature named by --feature: in the workspace, and a feature.
export const resolveFeature = Effect.fn("tasks.resolveFeature")(function* (
  reference: Option.Option<string>,
  workspaceId: string,
) {
  if (Option.isNone(reference)) return undefined;
  const feature = yield* withSpinner(`Loading ${reference.value}`)(
    resolveTask(reference.value),
  );
  if (feature.workspaceId !== workspaceId) {
    return yield* new InvalidArgument({
      message: `${taskLabel(taskRef(feature))} is in another workspace.`,
      hint: "A task can only belong to a feature in its own project. Pass -w with the feature's workspace.",
    });
  }
  if (taskTypeOf(feature.task) !== "feature") {
    return yield* notAFeature(feature);
  }
  return feature;
});

export function projectOrFeature(
  project: Option.Option<string>,
  feature: ResolvedTask | undefined,
): Option.Option<string> {
  return Option.isSome(project) || !feature
    ? project
    : Option.some(feature.project.id);
}

export function checkFeatureProject(
  feature: ResolvedTask,
  project: { readonly id: string; readonly name: string },
): Result.Result<void, InvalidArgument> {
  if (feature.project.id === project.id) return Result.succeed(undefined);
  return Result.fail(
    new InvalidArgument({
      message: `${taskLabel(taskRef(feature))} is a feature of ${feature.project.name}, not ${project.name}.`,
      hint: "A task can only belong to a feature in its own project.",
    }),
  );
}
