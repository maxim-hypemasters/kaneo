import { Effect, Option } from "effect";
import { Command, Flag } from "effect/cli";
import { listFeatures } from "../../api/features.js";
import { InvalidArgument } from "../../errors/errors.js";
import { emit } from "../../output/emit.js";
import {
  resolveProject,
  resolveWorkspaceId,
} from "../../services/selection.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";

export const runFeatureList = Effect.fn("command.feature.list")(
  function* (options: {
    readonly project: Option.Option<string>;
    readonly archived: boolean;
    readonly search: Option.Option<string>;
    readonly page: number;
    readonly limit: number;
  }) {
    if (options.page < 1 || options.limit < 1 || options.limit > 100)
      return yield* new InvalidArgument({
        message: "Use a positive page and a limit between 1 and 100.",
      });
    const workspaceId = yield* resolveWorkspaceId();
    const project = yield* resolveProject(workspaceId, options.project);
    const result = yield* listFeatures(project.id, {
      archived: options.archived,
      search: Option.getOrUndefined(options.search),
      page: options.page,
      limit: options.limit,
    });
    yield* emit(result, (ui, page) =>
      page.data.length
        ? [
            ...page.data.map(
              (item) =>
                `  ${item.number === null ? item.id : `${project.slug.toUpperCase()}-${item.number}`}  ${item.title}  ${ui.theme.muted(`${item.milestoneCount} milestones`)}`,
            ),
            ui.theme.muted(
              `  Page ${page.pagination.page} of ${page.pagination.totalPages} · ${page.pagination.total} Features`,
            ),
          ]
        : [ui.theme.muted("No Features")],
    );
  },
);
export const featureList = Command.make(
  "list",
  {
    project: projectFlag,
    archived: Flag.Boolean("archived").pipe(
      Flag.withDescription("Show archived knowledge Features"),
    ),
    search: Flag.String("search").pipe(
      Flag.withDescription("Search Feature titles"),
      Flag.optional,
    ),
    page: Flag.Int("page").pipe(Flag.withDefault(1)),
    limit: Flag.Int("limit").pipe(Flag.withDefault(50)),
  },
  runFeatureList,
).pipe(
  Command.withDescription("Browse a project's Feature knowledge library"),
  Command.provide(ApiLayer),
);
