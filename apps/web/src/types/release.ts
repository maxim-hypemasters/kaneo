import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

// A release with its progress, as the project's release list returns it.
export type Release = InferResponseType<
  (typeof client)["release"]["project"][":projectId"]["$get"],
  200
>[number];

export type ReleaseProgress = Release["progress"];

// A release without its progress, for views that show only names and dates.
export type ReleaseSummary = Omit<Release, "progress">;

export type ReleaseDates = Pick<
  Release,
  "startDate" | "codeFreezeDate" | "submissionDate"
>;

export type ReleasePhase =
  | "upcoming"
  | "inProgress"
  | "codeFreeze"
  | "pastSubmission";

export type ReleaseDateKind = "start" | "codeFreeze" | "submission";
