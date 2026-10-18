import type { Release, UpdateReleaseBody } from "../api/releases.js";
import { formatReleaseDay } from "./release-dates.js";

export function describeReleaseChanges(
  before: Release,
  body: UpdateReleaseBody,
  today: string,
): string[] {
  const details: string[] = [];
  if (body.name !== undefined && body.name !== before.name) {
    details.push(`renamed from ${before.name}`);
  }
  const days = [
    ["start", body.startDate, before.startDate],
    ["code freeze", body.codeFreezeDate, before.codeFreezeDate],
    ["submission", body.submissionDate, before.submissionDate],
  ] as const;
  for (const [label, next, previous] of days) {
    if (next !== undefined && next !== previous) {
      details.push(`${label} ${formatReleaseDay(next, today)}`);
    }
  }
  if (
    body.description !== undefined &&
    body.description !== before.description
  ) {
    details.push(
      body.description === null ? "description cleared" : "description updated",
    );
  }
  return details.length > 0 ? details : ["no changes"];
}
