import { Effect, Option } from "effect";
import type { Release } from "../api/releases.js";
import { InvalidArgument } from "../errors/errors.js";
import { Output } from "../output/output.js";
import { pick } from "../prompts/pick.js";
import { matchRelease } from "./match-release.js";

export function releaseNotFound(
  reference: string,
  projectName: string,
  flag?: string,
): InvalidArgument {
  return new InvalidArgument({
    message: `${flag ? `${flag} ` : ""}"${reference.trim()}" does not match a release in ${projectName}.`,
    hint: "Run kaneo release list to see the project's releases.",
  });
}

// The release named by an argument or flag, or picked in a terminal.
export const chooseRelease = Effect.fn("releases.choose")(function* (
  releases: ReadonlyArray<Release>,
  reference: Option.Option<string>,
  options: {
    readonly projectName: string;
    readonly example: string;
    readonly flag?: string;
  },
) {
  const output = yield* Output;
  if (Option.isNone(reference)) {
    if (releases.length === 0) {
      return yield* new InvalidArgument({
        message: `${options.projectName} has no releases yet.`,
        hint: "Create one with kaneo release create <name>.",
      });
    }
    if (output.interactive) {
      return yield* pick(
        "Choose a release",
        releases.map((release) => ({
          title: release.name,
          value: release,
          description: `${release.startDate} to ${release.submissionDate}`,
        })),
      );
    }
    return yield* new InvalidArgument({
      message: "A release is required.",
      hint: `Pass a release name or id, for example ${options.example}.`,
    });
  }
  const match = matchRelease(releases, reference.value);
  if (match.kind === "found") return match.release;
  if (match.kind === "ambiguous") {
    return yield* new InvalidArgument({
      message: `"${reference.value.trim()}" matches ${match.candidates.length} releases.`,
      hint: `Pass the exact name or the id: ${match.candidates.map((release) => `${release.name} (${release.id})`).join(", ")}.`,
    });
  }
  return yield* releaseNotFound(
    reference.value,
    options.projectName,
    options.flag,
  );
});
