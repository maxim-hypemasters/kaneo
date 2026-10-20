import { Effect, type Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { deleteRelease } from "../../api/releases.js";
import { emit } from "../../output/emit.js";
import { withSpinner } from "../../output/spinner.js";
import { confirmDestructive } from "../../prompts/confirm-destructive.js";
import { chooseRelease } from "../../releases/choose-release.js";
import { releaseItemsLabel } from "../../releases/release-items-label.js";
import { renderReleaseChange } from "../../releases/render-release-change.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";
import { loadProjectReleases } from "./load-releases.js";

export const runReleaseDelete = Effect.fn("command.release.delete")(
  function* (options: {
    readonly release: Option.Option<string>;
    readonly project: Option.Option<string>;
    readonly yes: boolean;
  }) {
    const { project, releases } = yield* loadProjectReleases(options.project);
    const target = yield* chooseRelease(releases, options.release, {
      projectName: project.name,
      example: "kaneo release delete 2.4",
    });
    const tasks = target.progress?.tasks.total ?? 0;
    const features = target.progress?.features.total ?? 0;
    const milestones = target.progress?.milestones?.total ?? 0;
    const items = releaseItemsLabel(tasks, milestones);
    const holdsItems = tasks + milestones > 0;

    yield* confirmDestructive({
      yes: options.yes,
      action: `Deleting release ${target.name}`,
      question: holdsItems
        ? `Delete release ${target.name}? Its ${items} stay in ${project.name}, without a release.`
        : `Delete release ${target.name}? It holds no tasks.`,
    });
    yield* withSpinner(`Deleting ${target.name}`)(deleteRelease(target.id));

    yield* emit(
      {
        id: target.id,
        projectId: target.projectId,
        name: target.name,
        deleted: true,
        tasks,
        features,
        milestones,
      },
      (ui) =>
        renderReleaseChange(ui, {
          verb: "Deleted",
          name: target.name,
          details: holdsItems ? [`${items} kept without a release`] : [],
        }),
    );
  },
);

export const releaseDelete = Command.make(
  "delete",
  {
    release: Argument.String("release").pipe(
      Argument.withDescription(
        "Release name or id; asked for when omitted in a terminal",
      ),
      Argument.optional,
    ),
    project: projectFlag,
    yes: Flag.Boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Delete without asking for confirmation"),
      Flag.withDefault(false),
    ),
  },
  (options) => runReleaseDelete(options),
).pipe(
  Command.withDescription(
    "Delete a release; its tasks and milestones stay in the project",
  ),
  Command.provide(ApiLayer),
);
