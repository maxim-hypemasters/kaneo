import { Effect, type Option } from "effect";
import { Command } from "effect/cli";
import { emit } from "../../output/emit.js";
import { toReleaseJson } from "../../releases/release-json.js";
import { renderReleaseList } from "../../releases/render-release-list.js";
import { projectUrl } from "../../render/links.js";
import { Session } from "../../services/session.js";
import { localDay } from "../../tasks/parse-date.js";
import { ApiLayer } from "../api-layer.js";
import { projectFlag } from "../column/project-flag.js";
import { loadProjectReleases } from "./load-releases.js";

export const runReleaseList = Effect.fn("command.release.list")(
  function* (options: { readonly project: Option.Option<string> }) {
    const session = yield* Session;
    const { project, releases } = yield* loadProjectReleases(options.project);
    const today = localDay(new Date());
    const json = releases.map((release) =>
      toReleaseJson(release, { today, webUrl: session.webUrl, project }),
    );

    yield* emit(json, (ui) =>
      renderReleaseList(ui, {
        projectName: project.name,
        projectSlug: project.slug,
        projectUrl: projectUrl(session.webUrl, project),
        today,
        releases: json,
      }),
    );
  },
);

export const releaseList = Command.make(
  "list",
  { project: projectFlag },
  (options) => runReleaseList(options),
).pipe(
  Command.withDescription(
    "List a project's releases with their dates, phase and progress",
  ),
  Command.provide(ApiLayer),
);
