import { Effect, type Option } from "effect";
import { Command, Flag } from "effect/cli";
import { listProjectMilestones } from "../../api/milestones.js";
import { InvalidArgument } from "../../errors/errors.js";
import { emit } from "../../output/emit.js";
import {
  resolveProject,
  resolveWorkspaceId,
} from "../../services/selection.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";

export const runMilestoneProjectList = Effect.fn(
  "command.milestone.list-project",
)(function* (options: {
  readonly project: Option.Option<string>;
  readonly page: number;
  readonly limit: number;
}) {
  if (options.page < 1 || options.limit < 1 || options.limit > 100)
    return yield* new InvalidArgument({
      message: "Use a positive page and a limit between 1 and 100.",
    });
  const workspaceId = yield* resolveWorkspaceId();
  const project = yield* resolveProject(workspaceId, options.project);
  const result = yield* listProjectMilestones(
    project.id,
    options.page,
    options.limit,
  );
  yield* emit(result, (ui, page) =>
    page.data.length
      ? page.data.map(
          (item) =>
            `  ${item.featureTitle} · ${item.title}  ${item.status ?? "Planned"}  ${item.progress.completed}/${item.progress.total}  ${ui.theme.muted(item.id)}`,
        )
      : [ui.theme.muted("No milestones")],
  );
});
export const milestoneProjectList = Command.make(
  "list-project",
  {
    project: projectFlag,
    page: Flag.Int("page").pipe(Flag.withDefault(1)),
    limit: Flag.Int("limit").pipe(Flag.withDefault(50)),
  },
  runMilestoneProjectList,
).pipe(
  Command.withDescription(
    "List a bounded page of project milestone planning summaries",
  ),
  Command.provide(ApiLayer),
);
