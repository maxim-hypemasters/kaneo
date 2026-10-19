import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { deleteMilestone, getMilestone } from "../../api/milestones.js";
import { emit } from "../../output/emit.js";
import { confirmDestructive } from "../../prompts/confirm-destructive.js";
import { ApiLayer } from "../api-layer.js";
export const runMilestoneDelete = Effect.fn("command.milestone.delete")(
  function* (options: { readonly id: string; readonly yes: boolean }) {
    const milestone = yield* getMilestone(options.id);
    yield* confirmDestructive({
      yes: options.yes,
      action: `Deleting ${milestone.title}`,
      question: `Delete ${milestone.title}? Linked Tasks and Bugs stay in their Feature and Release without a milestone.`,
    });
    yield* deleteMilestone(options.id);
    yield* emit({ id: options.id, deleted: true }, (ui) => [
      `${ui.theme.success(ui.glyphs.tick)} Deleted ${milestone.title}`,
    ]);
  },
);
export const milestoneDelete = Command.make(
  "delete",
  {
    id: Argument.String("id"),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  runMilestoneDelete,
).pipe(
  Command.withDescription("Delete a milestone while keeping its linked work"),
  Command.provide(ApiLayer),
);
