import { Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { getMilestone } from "../../api/milestones.js";
import { ApiLayer } from "../api-layer.js";
import { emitMilestone } from "./shared.js";
export const runMilestoneView = Effect.fn("command.milestone.view")(
  function* (options: { readonly id: string }) {
    yield* emitMilestone(yield* getMilestone(options.id), "Milestone");
  },
);
export const milestoneView = Command.make(
  "view",
  { id: Argument.String("id") },
  runMilestoneView,
).pipe(
  Command.withDescription("Get milestone metadata and progress"),
  Command.provide(ApiLayer),
);
