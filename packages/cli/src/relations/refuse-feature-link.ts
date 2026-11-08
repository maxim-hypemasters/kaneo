import { Result } from "effect";
import { taskTypeOf } from "../api/task-features.js";
import { InvalidArgument } from "../errors/errors.js";
import type { ResolvedTask } from "../tasks/resolve-task.js";
import { FEATURE_HINT } from "./relation-types.js";
import { taskLabel, taskRef } from "./task-ref.js";

// Features have no relations; the server refuses them too, but this names
// the feature before anything is sent.
export function refuseFeatureLink(pair: {
  readonly task: ResolvedTask;
  readonly other: ResolvedTask;
}): Result.Result<void, InvalidArgument> {
  const feature = [pair.task, pair.other].find(
    (item) => taskTypeOf(item.task) === "feature",
  );
  if (!feature) return Result.succeed(undefined);
  return Result.fail(
    new InvalidArgument({
      message: `${taskLabel(taskRef(feature))} is a feature, and features don't have relations.`,
      hint: FEATURE_HINT,
    }),
  );
}
