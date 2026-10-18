import type { ReleaseDates, ReleasePhase } from "@/types/release";

// Days compare as YYYY-MM-DD strings. The API documents the same rule.
export function releasePhase(
  release: ReleaseDates,
  today: string,
): ReleasePhase {
  if (today < release.startDate) return "upcoming";
  if (today < release.codeFreezeDate) return "inProgress";
  if (today <= release.submissionDate) return "codeFreeze";
  return "pastSubmission";
}
