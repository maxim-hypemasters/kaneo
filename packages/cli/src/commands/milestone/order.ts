import { Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { reorderMilestones } from "../../api/milestones.js";
import { InvalidArgument } from "../../errors/errors.js";
import { emit } from "../../output/emit.js";
import { ApiLayer } from "../api-layer.js";
import { featureFlag, resolveMilestoneFeature } from "./shared.js";
export const runMilestoneOrder = Effect.fn("command.milestone.order")(
  function* (options: {
    readonly feature: string;
    readonly milestone: ReadonlyArray<string>;
  }) {
    if (new Set(options.milestone).size !== options.milestone.length)
      return yield* new InvalidArgument({
        message: "Milestone IDs must be unique.",
      });
    const featureId = yield* resolveMilestoneFeature(options.feature);
    const milestones = yield* reorderMilestones(featureId, options.milestone);
    yield* emit(milestones, (ui) => [
      `${ui.theme.success(ui.glyphs.tick)} Updated milestone order`,
    ]);
  },
);
export const milestoneOrder = Command.make(
  "order",
  {
    feature: featureFlag,
    milestone: Flag.String("milestone").pipe(
      Flag.withDescription(
        "Milestone ID in desired order; repeat for every milestone",
      ),
      Flag.atLeast(0),
    ),
  },
  runMilestoneOrder,
).pipe(
  Command.withDescription("Replace a Feature's complete milestone order"),
  Command.provide(ApiLayer),
);
