import { Effect } from "effect";
import { Command } from "effect/cli";
import { listMilestones } from "../../api/milestones.js";
import { emit } from "../../output/emit.js";
import { ApiLayer } from "../api-layer.js";
import { featureFlag, resolveMilestoneFeature } from "./shared.js";

export const runMilestoneList = Effect.fn("command.milestone.list")(
  function* (options: { readonly feature: string }) {
    const featureId = yield* resolveMilestoneFeature(options.feature);
    const milestones = yield* listMilestones(featureId);
    yield* emit(milestones, (ui, items) =>
      items.length
        ? items.map(
            (item) =>
              `  ${item.title}  ${item.progress.completed}/${item.progress.total} completed  ${item.id}${item.startDate ? `  start ${item.startDate}` : ""}${item.endDate ? `  end ${item.endDate}` : ""}`,
          )
        : [ui.theme.muted("No milestones")],
    );
  },
);
export const milestoneList = Command.make(
  "list",
  { feature: featureFlag },
  runMilestoneList,
).pipe(
  Command.withDescription("List a Feature's ordered milestones and progress"),
  Command.provide(ApiLayer),
);
