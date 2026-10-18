import type { Release, ReleaseDates } from "@/types/release";

export type ReleaseDateField = keyof ReleaseDates;

// What the release dialog edits. Dates are YYYY-MM-DD, null until picked.
export type ReleaseFormValues = {
  name: string;
  description: string;
} & Record<ReleaseDateField, string | null>;

export function releaseFormValues(
  release: Release | null,
  suggested: ReleaseDates | null,
): ReleaseFormValues {
  if (release) {
    return {
      name: release.name,
      description: release.description ?? "",
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    };
  }
  return {
    name: "",
    description: "",
    startDate: suggested?.startDate ?? null,
    codeFreezeDate: suggested?.codeFreezeDate ?? null,
    submissionDate: suggested?.submissionDate ?? null,
  };
}
