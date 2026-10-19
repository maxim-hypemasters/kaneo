import { Effect, Option } from "effect";
import { getMilestone } from "../api/milestones.js";
import { InvalidArgument } from "../errors/errors.js";

export const resolveTaskMilestone = Effect.fnUntraced(function* (
  input: Option.Option<string> | undefined,
  featureId: string | null | undefined,
) {
  if (!input || Option.isNone(input)) return undefined;
  const id = input.value.trim();
  if (id.toLowerCase() === "none") return null;
  if (!featureId)
    return yield* new InvalidArgument({
      message: "A milestone requires an existing Feature.",
      hint: "Set --feature first, then choose one of that Feature's milestone IDs.",
    });
  const milestone = yield* getMilestone(id);
  if (milestone.featureId !== featureId)
    return yield* new InvalidArgument({
      message: "The milestone belongs to a different Feature.",
      hint: "Choose a milestone of the task's Feature; milestone assignment never moves Feature membership.",
    });
  return milestone.id;
});
