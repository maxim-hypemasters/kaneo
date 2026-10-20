import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { createMilestone } from "../../api/milestones.js";
import { resolveMilestoneTasks } from "../../milestones/resolve-milestone-tasks.js";
import { InvalidArgument } from "../../errors/errors.js";
import { ApiLayer } from "../api-layer.js";
import {
  checkMilestoneDateOrder,
  emitMilestone,
  featureFlag,
  milestoneDay,
  resolveMilestoneFeature,
} from "./shared.js";
export const runMilestoneCreate = Effect.fn("command.milestone.create")(
  function* (options: {
    readonly title: string;
    readonly feature: string;
    readonly description: Option.Option<string>;
    readonly startDate: Option.Option<string>;
    readonly endDate: Option.Option<string>;
    readonly lead?: Option.Option<string>;
    readonly status?: Option.Option<string>;
    readonly priority?: Option.Option<string>;
    readonly release?: Option.Option<string>;
    readonly task?: ReadonlyArray<string>;
  }) {
    const title = options.title.trim();
    if (!title || title.length > 255)
      return yield* new InvalidArgument({
        message: "A milestone title must contain 1–255 characters.",
      });
    const startDate = yield* milestoneDay(options.startDate, "--start-date");
    const endDate = yield* milestoneDay(options.endDate, "--end-date");
    yield* checkMilestoneDateOrder(startDate, endDate);
    const featureId = yield* resolveMilestoneFeature(options.feature);
    const taskIds = yield* resolveMilestoneTasks(options.task ?? [], featureId);
    const milestone = yield* createMilestone(featureId, {
      title,
      ...(Option.isSome(options.description)
        ? { description: options.description.value }
        : {}),
      ...(startDate === undefined ? {} : { startDate }),
      ...(endDate === undefined ? {} : { endDate }),
      ...(Option.getOrUndefined(options.lead ?? Option.none()) === undefined
        ? {}
        : {
            leadId:
              Option.getOrUndefined(options.lead ?? Option.none()) === "none"
                ? null
                : Option.getOrUndefined(options.lead ?? Option.none()),
          }),
      ...(Option.getOrUndefined(options.status ?? Option.none()) === undefined
        ? {}
        : { status: Option.getOrUndefined(options.status ?? Option.none()) }),
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
      ...(taskIds.length ? { taskIds } : {}),
    });
    yield* emitMilestone(milestone, "Created");
  },
);
export const milestoneCreate = Command.make(
  "create",
  {
    title: Argument.String("title"),
    feature: featureFlag,
    description: Flag.String("description").pipe(
      Flag.withAlias("d"),
      Flag.optional,
    ),
    task: Flag.String("task").pipe(
      Flag.withDescription(
        "Existing Task or Bug in this Feature, by ticket id or id; repeat to link several atomically",
      ),
      Flag.atLeast(0),
    ),
    startDate: Flag.String("start-date").pipe(
      Flag.withDescription(
        "Optional start date: YYYY-MM-DD, today, tomorrow, +3d or none",
      ),
      Flag.optional,
    ),
    lead: Flag.String("lead").pipe(
      Flag.withDescription("Milestone lead user ID, or none to clear"),
      Flag.optional,
    ),
    status: Flag.String("status").pipe(
      Flag.withDescription("Project workflow column slug"),
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
    endDate: Flag.String("end-date").pipe(
      Flag.withDescription(
        "Optional end date: YYYY-MM-DD, today, tomorrow, +3d or none",
      ),
      Flag.optional,
    ),
  },
  runMilestoneCreate,
).pipe(
  Command.withDescription("Append a milestone to a Feature"),
  Command.provide(ApiLayer),
);
