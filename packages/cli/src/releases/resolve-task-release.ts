import { Effect, Option } from "effect";
import type { Release } from "../api/releases.js";
import { chooseRelease } from "./choose-release.js";
import { listProjectReleases } from "./list-project-releases.js";

export function isNoRelease(reference: string): boolean {
  return reference.trim().toLowerCase() === "none";
}

// The release named by --release in the task's project: undefined without
// the flag, null for none, otherwise the release by name or id. The releases
// load even for none, so a server without releases says so up front.
export const resolveTaskRelease = Effect.fn("releases.resolveTaskRelease")(
  function* (
    reference: Option.Option<string>,
    project: { readonly id: string; readonly name: string },
  ) {
    if (Option.isNone(reference)) return undefined;
    const releases = yield* listProjectReleases(project);
    if (isNoRelease(reference.value)) return null;
    const release: Release = yield* chooseRelease(releases, reference, {
      projectName: project.name,
      example: "--release 2.4",
      flag: "--release",
    });
    return release;
  },
);
