import { addDays, differenceInCalendarDays } from "date-fns";
import { parseReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import type { Release, ReleaseDates } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { plannedMoveTaskIds } from "../release-plan-changes";

export function suggestedReleaseDates(
  release: Release,
  changes: ReleasePlanChanges,
  preview: ReleasePlanPreview,
): ReleaseDates {
  const current = changes.releaseDates ?? release;
  const gap = Math.max(
    0,
    differenceInCalendarDays(
      parseReleaseDate(current.submissionDate),
      parseReleaseDate(current.codeFreezeDate),
    ),
  );
  const moved = plannedMoveTaskIds(changes, preview.tasks);
  let latestFinish = Number.NEGATIVE_INFINITY;
  for (const task of preview.tasks) {
    if (
      task.completed ||
      task.reason ||
      !task.start ||
      !task.end ||
      moved.has(task.taskId)
    )
      continue;
    const finish = Date.parse(task.end);
    if (Number.isFinite(finish)) latestFinish = Math.max(latestFinish, finish);
  }
  let codeFreezeDate =
    current.codeFreezeDate > release.startDate
      ? current.codeFreezeDate
      : release.startDate;
  if (Number.isFinite(latestFinish)) {
    // The scheduler treats finishes as exclusive: midnight belongs to the
    // preceding work day, in the project's planning timezone.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: preview.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(latestFinish - 1));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)!.value;
    const finishDay = `${part("year")}-${part("month")}-${part("day")}`;
    if (finishDay > codeFreezeDate) codeFreezeDate = finishDay;
  }
  const bufferedSubmission = toReleaseDate(
    addDays(parseReleaseDate(codeFreezeDate), gap),
  );
  return {
    startDate: release.startDate,
    codeFreezeDate,
    submissionDate:
      current.submissionDate > bufferedSubmission
        ? current.submissionDate
        : bufferedSubmission,
  };
}
