import { Effect } from "effect";
import { listReleases } from "../api/releases.js";
import { InvalidArgument } from "../errors/errors.js";
import { withSpinner } from "../output/spinner.js";

// A server from before releases has no release routes, so the project it has
// just found answers 404 here.
export const listProjectReleases = Effect.fnUntraced(function* (project: {
  readonly id: string;
  readonly name: string;
}) {
  return yield* withSpinner(`Loading ${project.name} releases`)(
    listReleases(project.id),
  ).pipe(
    Effect.catchTag("NotFound", () =>
      Effect.fail(
        new InvalidArgument({
          message: "This Kaneo server has no releases yet.",
          hint: "Update the server, then try again.",
        }),
      ),
    ),
  );
});
