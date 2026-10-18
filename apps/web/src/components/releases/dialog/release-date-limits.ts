import type { ReleaseDateKind } from "@/types/release";
import type { ReleaseFormValues } from "./release-form-values";

export type ReleaseDateLimit = { day: string; kind: ReleaseDateKind };

export type ReleaseDateLimits = {
  // The earliest day allowed, and the date that sets it.
  min?: ReleaseDateLimit;
  // The latest day allowed, and the date that sets it.
  max?: ReleaseDateLimit;
};

function limit(
  day: string | null,
  kind: ReleaseDateKind,
): ReleaseDateLimit | undefined {
  return day ? { day, kind } : undefined;
}

// Keeps start ≤ code freeze ≤ submission while picking: each date is held
// between its neighbours, skipping one that isn't set yet.
export function releaseDateLimits(
  values: Pick<
    ReleaseFormValues,
    "startDate" | "codeFreezeDate" | "submissionDate"
  >,
  kind: ReleaseDateKind,
): ReleaseDateLimits {
  const start = limit(values.startDate, "start");
  const freeze = limit(values.codeFreezeDate, "codeFreeze");
  const submission = limit(values.submissionDate, "submission");
  if (kind === "start") return { max: freeze ?? submission };
  if (kind === "codeFreeze") return { min: start, max: submission };
  return { min: freeze ?? start };
}
