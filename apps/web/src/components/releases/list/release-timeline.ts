import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";

type TimelineRelease = Pick<
  Release,
  "id" | "name" | "startDate" | "codeFreezeDate" | "submissionDate"
>;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIdentity(left: TimelineRelease, right: TimelineRelease) {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

function phaseOrder(release: TimelineRelease, today: string) {
  const phase = releasePhase(release, today);
  return phase === "upcoming" ? 0 : phase === "pastSubmission" ? 2 : 1;
}

export function releaseTimelineOrder<T extends TimelineRelease>(
  releases: readonly T[],
  today: string,
): T[] {
  return [...releases].sort(
    (left, right) =>
      phaseOrder(left, today) - phaseOrder(right, today) ||
      compareText(right.startDate, left.startDate) ||
      compareIdentity(left, right),
  );
}
