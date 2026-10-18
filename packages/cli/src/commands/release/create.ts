import { Effect, Option, Result } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { createRelease } from "../../api/releases.js";
import { Cancelled, InvalidArgument } from "../../errors/errors.js";
import { readTextInput } from "../../input/read-text-input.js";
import { emit } from "../../output/emit.js";
import { Output } from "../../output/output.js";
import { withSpinner } from "../../output/spinner.js";
import { promptTheme } from "../../prompts/prompt-theme.js";
import {
  checkReleaseDateOrder,
  formatReleaseDay,
} from "../../releases/release-dates.js";
import { EMPTY_PROGRESS, toReleaseJson } from "../../releases/release-json.js";
import { renderReleaseChange } from "../../releases/render-release-change.js";
import {
  resolveProject,
  resolveWorkspaceId,
} from "../../services/selection.js";
import { Session } from "../../services/session.js";
import { localDay, parseDayInput } from "../../tasks/parse-date.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";

const DATES_HINT =
  "Pass the three dates, for example --start 2026-11-02 --code-freeze 2026-11-20 --submission 2026-11-27.";

const askName = Effect.fnUntraced(function* (name: Option.Option<string>) {
  const given = name.pipe(
    Option.map((value) => value.trim()),
    Option.filter((value) => value !== ""),
  );
  if (Option.isSome(given)) return given.value;
  const output = yield* Output;
  if (!output.interactive) {
    return yield* new InvalidArgument({
      message: "A release name is required.",
      hint: 'Pass it as the first argument, for example kaneo release create "2.4".',
    });
  }
  return yield* Prompt.run(
    Prompt.String({
      message: "Release name",
      validate: (value) =>
        value.trim() === ""
          ? Effect.fail("Enter a name")
          : Effect.succeed(value.trim()),
      theme: promptTheme(output.ui),
    }),
  ).pipe(Effect.catchTag("QuitError", () => Effect.fail(new Cancelled())));
});

const askDay = Effect.fnUntraced(function* (
  day: Option.Option<string>,
  flag: string,
  label: string,
  now: Date,
) {
  if (Option.isSome(day)) {
    return yield* Effect.fromResult(parseDayInput(day.value, now, flag));
  }
  const output = yield* Output;
  if (!output.interactive) {
    return yield* new InvalidArgument({
      message: `${flag} is required.`,
      hint: DATES_HINT,
    });
  }
  const answer = yield* Prompt.run(
    Prompt.String({
      message: `${label} (YYYY-MM-DD, today, tomorrow or +3d)`,
      validate: (value) => {
        const parsed = parseDayInput(value, now, flag);
        return Result.isSuccess(parsed)
          ? Effect.succeed(value)
          : Effect.fail("Enter a date such as 2026-11-02 or +7d");
      },
      theme: promptTheme(output.ui),
    }),
  ).pipe(Effect.catchTag("QuitError", () => Effect.fail(new Cancelled())));
  return yield* Effect.fromResult(parseDayInput(answer, now, flag));
});

export const runReleaseCreate = Effect.fn("command.release.create")(
  function* (options: {
    readonly name: Option.Option<string>;
    readonly project: Option.Option<string>;
    readonly start: Option.Option<string>;
    readonly codeFreeze: Option.Option<string>;
    readonly submission: Option.Option<string>;
    readonly description: Option.Option<string>;
  }) {
    const session = yield* Session;
    const now = new Date();
    // Check the dates given as flags before asking for anything.
    for (const [day, flag] of [
      [options.start, "--start"],
      [options.codeFreeze, "--code-freeze"],
      [options.submission, "--submission"],
    ] as const) {
      if (Option.isSome(day)) {
        yield* Effect.fromResult(parseDayInput(day.value, now, flag));
      }
    }
    const workspaceId = yield* resolveWorkspaceId();
    const project = yield* resolveProject(workspaceId, options.project);
    const name = yield* askName(options.name);
    const dates = {
      startDate: yield* askDay(options.start, "--start", "Start", now),
      codeFreezeDate: yield* askDay(
        options.codeFreeze,
        "--code-freeze",
        "Code freeze",
        now,
      ),
      submissionDate: yield* askDay(
        options.submission,
        "--submission",
        "Submission",
        now,
      ),
    };
    yield* Effect.fromResult(checkReleaseDateOrder(dates));
    const description = Option.getOrUndefined(options.description)?.trim();

    const created = yield* withSpinner(`Creating ${name}`)(
      createRelease(project.id, {
        name,
        ...dates,
        ...(description ? { description } : {}),
      }),
    );
    const today = localDay(now);
    const json = toReleaseJson(
      { ...created, progress: created.progress ?? EMPTY_PROGRESS },
      { today, webUrl: session.webUrl, project },
    );

    yield* emit(json, (ui, release) =>
      renderReleaseChange(ui, {
        verb: "Created",
        name: release.name,
        url: release.url,
        details: [
          `${formatReleaseDay(release.startDate, today)} to ${formatReleaseDay(release.submissionDate, today)}`,
          `code freeze ${formatReleaseDay(release.codeFreezeDate, today)}`,
          `in ${project.slug.toUpperCase()}`,
        ],
      }),
    );
  },
);

export const releaseCreate = Command.make(
  "create",
  {
    name: Argument.String("name").pipe(
      Argument.withDescription(
        "Release name, unique in the project; asked for when omitted in a terminal",
      ),
      Argument.optional,
    ),
    project: projectFlag,
    start: Flag.String("start").pipe(
      Flag.withDescription(
        "Start date: YYYY-MM-DD, today, tomorrow or +3d; asked for when omitted in a terminal",
      ),
      Flag.optional,
    ),
    codeFreeze: Flag.String("code-freeze").pipe(
      Flag.withDescription("Code freeze date, on or after the start date"),
      Flag.optional,
    ),
    submission: Flag.String("submission").pipe(
      Flag.withDescription("Submission date, on or after the code freeze"),
      Flag.optional,
    ),
    description: Flag.String("description").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("What the release delivers, or - to read stdin"),
      Flag.optional,
    ),
    descriptionFile: Flag.String("description-file").pipe(
      Flag.withAlias("F"),
      Flag.withDescription("Read the description from a file, or - for stdin"),
      Flag.optional,
    ),
  },
  (options) =>
    Effect.flatMap(
      readTextInput({
        value: options.description,
        file: options.descriptionFile,
        flag: "--description",
      }),
      (description) => runReleaseCreate({ ...options, description }),
    ),
).pipe(
  Command.withDescription(
    "Plan a release with a start, a code freeze and a submission date",
  ),
  Command.provide(ApiLayer),
);
