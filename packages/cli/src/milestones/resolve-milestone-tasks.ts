import { Effect } from "effect";
import { taskTypeOf } from "../api/task-features.js";
import { InvalidArgument } from "../errors/errors.js";
import { fetchTask } from "../tasks/resolve-task.js";

export const resolveMilestoneTasks = Effect.fnUntraced(function* (
  references: ReadonlyArray<string>,
  featureId: string,
) {
  const tasks = yield* Effect.forEach(references, fetchTask, {
    concurrency: 6,
  });
  for (const task of tasks) {
    if (taskTypeOf(task) === "feature" || task.featureId !== featureId) {
      return yield* new InvalidArgument({
        message:
          "Milestone tasks must already be Tasks or Bugs in the selected Feature.",
        hint: "Choose work from that Feature. Creating a milestone does not change Feature membership.",
      });
    }
  }
  return [...new Set(tasks.map((task) => task.id))];
});
