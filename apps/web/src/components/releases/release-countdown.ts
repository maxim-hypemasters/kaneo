import { differenceInCalendarDays } from "date-fns";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";

export type ReleaseCountdown = {
  key:
    | "tasks:releases.countdown.startsIn"
    | "tasks:releases.countdown.startsToday"
    | "tasks:releases.countdown.freezeIn"
    | "tasks:releases.countdown.freezeToday"
    | "tasks:releases.countdown.submissionIn"
    | "tasks:releases.countdown.submissionToday"
    | "tasks:releases.countdown.submittedAgo";
  count: number;
};

function daysBetween(from: string, to: string) {
  return differenceInCalendarDays(parseReleaseDate(to), parseReleaseDate(from));
}

// The next date to come, counted in calendar days from the viewer's today. A
// day that starts a phase and is also a later date (code freeze on the start
// day) reads as the later one.
export function releaseCountdown(
  release: ReleaseDates,
  today: string,
): ReleaseCountdown {
  const { startDate, codeFreezeDate, submissionDate } = release;
  if (today < startDate) {
    return {
      key: "tasks:releases.countdown.startsIn",
      count: daysBetween(today, startDate),
    };
  }
  if (today === startDate && startDate < codeFreezeDate) {
    return { key: "tasks:releases.countdown.startsToday", count: 0 };
  }
  if (today < codeFreezeDate) {
    return {
      key: "tasks:releases.countdown.freezeIn",
      count: daysBetween(today, codeFreezeDate),
    };
  }
  if (today === codeFreezeDate && codeFreezeDate < submissionDate) {
    return { key: "tasks:releases.countdown.freezeToday", count: 0 };
  }
  if (today < submissionDate) {
    return {
      key: "tasks:releases.countdown.submissionIn",
      count: daysBetween(today, submissionDate),
    };
  }
  if (today === submissionDate) {
    return { key: "tasks:releases.countdown.submissionToday", count: 0 };
  }
  return {
    key: "tasks:releases.countdown.submittedAgo",
    count: daysBetween(submissionDate, today),
  };
}
