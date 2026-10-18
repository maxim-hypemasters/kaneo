import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { type UpdateReleaseBody, updateRelease } from "../../api/releases.js";
import { InvalidArgument } from "../../errors/errors.js";
import { readTextInput } from "../../input/read-text-input.js";
import { emit } from "../../output/emit.js";
import { withSpinner } from "../../output/spinner.js";
import { chooseRelease } from "../../releases/choose-release.js";
import { describeReleaseChanges } from "../../releases/describe-release-changes.js";
import { checkReleaseDateOrder } from "../../releases/release-dates.js";
import { toReleaseJson } from "../../releases/release-json.js";
import { renderReleaseChange } from "../../releases/render-release-change.js";
import { Session } from "../../services/session.js";
import { localDay, parseDayInput } from "../../tasks/parse-date.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";
import { loadProjectReleases } from "./load-releases.js";

const dayFlag = (input: Option.Option<string>, now: Date, flag: string) =>
  Option.match(input, {
    onNone: () => Effect.succeed(undefined),
    onSome: (value) => Effect.fromResult(parseDayInput(value, now, flag)),
  });

export const runReleaseEdit = Effect.fn("command.release.edit")(
  function* (options: {
    readonly release: Option.Option<string>;
    readonly project: Option.Option<string>;
    readonly name: Option.Option<string>;
    readonly start: Option.Option<string>;
    readonly codeFreeze: Option.Option<string>;
    readonly submission: Option.Option<string>;
    readonly description: Option.Option<string>;
  }) {
    if (
      [
        options.name,
        options.start,
        options.codeFreeze,
        options.submission,
        options.description,
      ].every((flag) => Option.isNone(flag))
    ) {
      return yield* new InvalidArgument({
        message: "Nothing to change.",
        hint: "Pass at least one of --name, --start, --code-freeze, --submission or --description.",
      });
    }
    const name = Option.getOrUndefined(options.name)?.trim();
    if (name === "") {
      return yield* new InvalidArgument({
        message: "The release name cannot be empty.",
        hint: 'Pass a name, for example --name "2.4.1".',
      });
    }
    const now = new Date();
    const startDate = yield* dayFlag(options.start, now, "--start");
    const codeFreezeDate = yield* dayFlag(
      options.codeFreeze,
      now,
      "--code-freeze",
    );
    const submissionDate = yield* dayFlag(
      options.submission,
      now,
      "--submission",
    );
    // An empty description clears it.
    const description = Option.map(options.description, (value) =>
      value.trim() === "" ? null : value.trim(),
    );

    const { project, releases } = yield* loadProjectReleases(options.project);
    const target = yield* chooseRelease(releases, options.release, {
      projectName: project.name,
      example: "kaneo release edit 2.4 --submission +7d",
    });
    yield* Effect.fromResult(
      checkReleaseDateOrder({
        startDate: startDate ?? target.startDate,
        codeFreezeDate: codeFreezeDate ?? target.codeFreezeDate,
        submissionDate: submissionDate ?? target.submissionDate,
      }),
    );
    if (
      name !== undefined &&
      releases.some(
        (release) => release.id !== target.id && release.name === name,
      )
    ) {
      return yield* new InvalidArgument({
        message: `A release named "${name}" already exists in ${project.name}.`,
        hint: "Pick another name.",
      });
    }

    const body: UpdateReleaseBody = {
      ...(name === undefined ? {} : { name }),
      ...(startDate === undefined ? {} : { startDate }),
      ...(codeFreezeDate === undefined ? {} : { codeFreezeDate }),
      ...(submissionDate === undefined ? {} : { submissionDate }),
      ...(Option.isSome(description) ? { description: description.value } : {}),
    };
    const updated = yield* withSpinner(`Updating ${target.name}`)(
      updateRelease(target.id, body),
    );
    const session = yield* Session;
    const today = localDay(now);
    // Editing a release doesn't change what it holds.
    const json = toReleaseJson(
      { ...updated, progress: updated.progress ?? target.progress },
      { today, webUrl: session.webUrl, project },
    );

    yield* emit(json, (ui, release) =>
      renderReleaseChange(ui, {
        verb: "Updated",
        name: release.name,
        url: release.url,
        details: describeReleaseChanges(target, body, today),
      }),
    );
  },
);

export const releaseEdit = Command.make(
  "edit",
  {
    release: Argument.String("release").pipe(
      Argument.withDescription(
        "Release name or id; asked for when omitted in a terminal",
      ),
      Argument.optional,
    ),
    project: projectFlag,
    name: Flag.String("name").pipe(
      Flag.withDescription("New name, unique in the project"),
      Flag.optional,
    ),
    start: Flag.String("start").pipe(
      Flag.withDescription(
        "New start date: YYYY-MM-DD, today, tomorrow or +3d",
      ),
      Flag.optional,
    ),
    codeFreeze: Flag.String("code-freeze").pipe(
      Flag.withDescription("New code freeze date"),
      Flag.optional,
    ),
    submission: Flag.String("submission").pipe(
      Flag.withDescription("New submission date"),
      Flag.optional,
    ),
    description: Flag.String("description").pipe(
      Flag.withAlias("d"),
      Flag.withDescription(
        'New description, or - to read stdin; pass "" to clear it',
      ),
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
      (description) => runReleaseEdit({ ...options, description }),
    ),
).pipe(
  Command.withDescription(
    "Rename a release, or change its dates or description",
  ),
  Command.provide(ApiLayer),
);
