import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { updateMilestone } from "../../api/milestones.js";
import { InvalidArgument } from "../../errors/errors.js";
import { ApiLayer } from "../api-layer.js";
import { emitMilestone } from "./shared.js";
export const runMilestoneEdit = Effect.fn("command.milestone.edit")(
  function* (options: {
    readonly id: string;
    readonly title: Option.Option<string>;
    readonly description: Option.Option<string>;
    readonly lead?: Option.Option<string>;
    readonly priority?: Option.Option<string>;
    readonly release?: Option.Option<string>;
  }) {
    if (
      [
        options.title,
        options.description,
        options.lead ?? Option.none(),
        options.priority ?? Option.none(),
        options.release ?? Option.none(),
      ].every(Option.isNone)
    )
      return yield* new InvalidArgument({
        message: "Nothing to change.",
        hint: "Pass --title, --description, --lead, --priority, --release.",
      });
    const title = Option.getOrUndefined(options.title)?.trim();
    if (title !== undefined && (!title || title.length > 255))
      return yield* new InvalidArgument({
        message: "A milestone title must contain 1–255 characters.",
      });
    const milestone = yield* updateMilestone(options.id, {
      ...(title === undefined ? {} : { title }),
      ...(Option.isSome(options.description)
        ? { description: options.description.value || null }
        : {}),
      ...(Option.getOrUndefined(options.lead ?? Option.none()) === undefined
        ? {}
        : {
            leadId:
              Option.getOrUndefined(options.lead ?? Option.none()) === "none"
                ? null
                : Option.getOrUndefined(options.lead ?? Option.none()),
          }),
      ...(Option.getOrUndefined(options.priority ?? Option.none()) === undefined
        ? {}
        : {
            priority: Option.getOrUndefined(options.priority ?? Option.none()),
          }),
      ...(Option.getOrUndefined(options.release ?? Option.none()) === undefined
        ? {}
        : {
            releaseId:
              Option.getOrUndefined(options.release ?? Option.none()) === "none"
                ? null
                : Option.getOrUndefined(options.release ?? Option.none()),
          }),
    });
    yield* emitMilestone(milestone, "Updated");
  },
);
export const milestoneEdit = Command.make(
  "edit",
  {
    id: Argument.String("id"),
    title: Flag.String("title").pipe(Flag.optional),
    description: Flag.String("description").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("New description; an empty string clears it"),
      Flag.optional,
    ),
    lead: Flag.String("lead").pipe(
      Flag.withDescription("Milestone lead user ID, or none to clear"),
      Flag.optional,
    ),
    priority: Flag.Literals("priority", [
      "no-priority",
      "low",
      "medium",
      "high",
      "urgent",
    ]).pipe(Flag.optional),
    release: Flag.String("release").pipe(
      Flag.withDescription("Release ID, or none to clear"),
      Flag.optional,
    ),
  },
  runMilestoneEdit,
).pipe(
  Command.withDescription("Edit milestone metadata"),
  Command.provide(ApiLayer),
);
