import { Effect, type Option } from "effect";
import { listProjectReleases } from "../../releases/list-project-releases.js";
import {
  resolveProject,
  resolveWorkspaceId,
} from "../../services/selection.js";

export const loadProjectReleases = Effect.fnUntraced(function* (
  project: Option.Option<string>,
) {
  const workspaceId = yield* resolveWorkspaceId();
  const resolved = yield* resolveProject(workspaceId, project);
  const releases = yield* listProjectReleases(resolved);
  return { project: resolved, releases };
});
