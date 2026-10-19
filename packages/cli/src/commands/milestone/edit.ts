import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { updateMilestone } from "../../api/milestones.js";
import { InvalidArgument } from "../../errors/errors.js";
import { ApiLayer } from "../api-layer.js";
import {
  checkMilestoneDateOrder,
  emitMilestone,
  milestoneDay,
} from "./shared.js";
export const runMilestoneEdit = Effect.fn("command.milestone.edit")(
  function* (options: {
    readonly id: string;
    readonly title: Option.Option<string>;
    readonly description: Option.Option<string>;
    readonly startDate: Option.Option<string>;
    readonly endDate: Option.Option<string>;
  }) {
    if (
      [
        options.title,
        options.description,
        options.startDate,
        options.endDate,
      ].every(Option.isNone)
    )
      return yield* new InvalidArgument({
        message: "Nothing to change.",
        hint: "Pass --title, --description, --start-date or --end-date (none clears either date).",
      });
    const title = Option.getOrUndefined(options.title)?.trim();
    if (title !== undefined && (!title || title.length > 255))
      return yield* new InvalidArgument({
        message: "A milestone title must contain 1–255 characters.",
      });
    const startDate = yield* milestoneDay(options.startDate, "--start-date");
    const endDate = yield* milestoneDay(options.endDate, "--end-date");
    yield* checkMilestoneDateOrder(startDate, endDate);
    const milestone = yield* updateMilestone(options.id, {
      ...(title === undefined ? {} : { title }),
      ...(Option.isSome(options.description)
        ? { description: options.description.value || null }
        : {}),
      ...(startDate === undefined ? {} : { startDate }),
      ...(endDate === undefined ? {} : { endDate }),
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
    startDate: Flag.String("start-date").pipe(
      Flag.withDescription("Optional start date, or none to clear"),
      Flag.optional,
    ),
    endDate: Flag.String("end-date").pipe(
      Flag.withDescription("Optional end date, or none to clear"),
      Flag.optional,
    ),
  },
  runMilestoneEdit,
).pipe(
  Command.withDescription("Edit milestone metadata"),
  Command.provide(ApiLayer),
);
