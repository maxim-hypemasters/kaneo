import type { ReleaseDates } from "../api/releases.js";

export type ReleasePhase =
  | "upcoming"
  | "in-progress"
  | "code-freeze"
  | "past-submission";

export const PHASE_LABELS: Readonly<Record<ReleasePhase, string>> = {
  upcoming: "upcoming",
  "in-progress": "in progress",
  "code-freeze": "code freeze",
  "past-submission": "past submission",
};

// The server stores no phase; it follows from today. YYYY-MM-DD strings sort
// as the days they name.
export function releasePhase(
  release: ReleaseDates,
  today: string,
): ReleasePhase {
  if (today < release.startDate) return "upcoming";
  if (today < release.codeFreezeDate) return "in-progress";
  if (today <= release.submissionDate) return "code-freeze";
  return "past-submission";
}
