import { Effect } from "effect";
import { Flag } from "effect/cli";
import { taskTypeOf } from "../../api/task-features.js";
import type { Milestone } from "../../api/milestones.js";
import { InvalidArgument } from "../../errors/errors.js";
import { emit } from "../../output/emit.js";
import { resolveTask } from "../../tasks/resolve-task.js";

export const featureFlag = Flag.String("feature").pipe(
  Flag.withDescription("Owning Feature ticket id or id, for example KAN-12"),
);
export const resolveMilestoneFeature = Effect.fnUntraced(function* (
  reference: string,
) {
  const resolved = yield* resolveTask(reference);
  if (taskTypeOf(resolved.task) !== "feature")
    return yield* new InvalidArgument({
      message: "Only Features can own milestones.",
      hint: "Pass --feature with a Feature ticket id or id.",
    });
  return resolved.task.id;
});
export const emitMilestone = (milestone: Milestone, verb: string) =>
  emit(milestone, (ui, item) => [
    `${ui.theme.success(ui.glyphs.tick)} ${verb} ${item.title}`,
    `  ${item.id}  ${item.progress.completed}/${item.progress.total} completed${item.startDate ? `  start ${item.startDate}` : ""}${item.endDate ? `  end ${item.endDate}` : ""}`,
  ]);
