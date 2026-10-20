import { Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { setFeatureArchived } from "../../api/features.js";
import { emit } from "../../output/emit.js";
import { ApiLayer } from "../api-layer.js";
import { resolveMilestoneFeature } from "../milestone/shared.js";

export const runFeatureArchive = Effect.fn("command.feature.archive")(
  function* (options: {
    readonly feature: string;
    readonly archived: boolean;
  }) {
    const id = yield* resolveMilestoneFeature(options.feature);
    const result = yield* setFeatureArchived(id, options.archived);
    yield* emit(result, (ui) => [
      `${ui.theme.success(ui.glyphs.tick)} ${options.archived ? "Archived" : "Restored"} Feature ${options.feature}`,
    ]);
  },
);
const argument = {
  feature: Argument.String("feature").pipe(
    Argument.withDescription("Feature ticket ID or ID"),
  ),
};
export const featureArchive = Command.make("archive", argument, (options) =>
  runFeatureArchive({ ...options, archived: true }),
).pipe(
  Command.withDescription(
    "Archive a Feature without archiving its milestones or work",
  ),
  Command.provide(ApiLayer),
);
export const featureUnarchive = Command.make("unarchive", argument, (options) =>
  runFeatureArchive({ ...options, archived: false }),
).pipe(
  Command.withDescription(
    "Restore an archived Feature to the knowledge library",
  ),
  Command.provide(ApiLayer),
);
