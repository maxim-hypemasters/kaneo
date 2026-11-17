import type { TimeOffCalendar, TimeOffType } from "@/fetchers/time-off/types";
import { isTimeOffRequest } from "./is-time-off-request";

// What a day away shows: a type for entries the viewer may see in full, a
// holiday name for the viewer's own holidays (or everyone's for approvers),
// otherwise a neutral "away".
export type AwayKind = TimeOffType | "away";
export type AwayDay = { kind: AwayKind; name?: string };
// userId -> day (YYYY-MM-DD) -> what that day shows.
export type AwayDaysByUser = ReadonlyMap<string, ReadonlyMap<string, AwayDay>>;

export const NO_AWAY_DAYS: AwayDaysByUser = new Map();

const DAY_MS = 86_400_000;

// A named holiday says the most, then a typed entry, then "away".
function rank(day: AwayDay) {
  if (day.name) return 2;
  return day.kind === "away" ? 0 : 1;
}

// The days members are away, from one or more calendar responses (e.g. one
// per year). Approved time off and other members' entries (which are
// approved) count, and so do calendar holidays; pending requests never do.
// An entry that comes back in two responses (it crosses New Year) counts
// once.
export function awayDaysByUser(
  calendars: readonly Pick<TimeOffCalendar, "entries" | "holidays">[],
): AwayDaysByUser {
  const byUser = new Map<string, Map<string, AwayDay>>();
  const mark = (userId: string, date: string, day: AwayDay) => {
    let days = byUser.get(userId);
    if (!days) {
      days = new Map();
      byUser.set(userId, days);
    }
    const current = days.get(date);
    if (!current || rank(day) > rank(current)) days.set(date, day);
  };

  for (const calendar of calendars) {
    for (const entry of calendar.entries) {
      if (entry.status !== undefined && entry.status !== "approved") continue;
      const day: AwayDay = {
        kind: isTimeOffRequest(entry) ? entry.type : "away",
      };
      // Whole days in UTC, so a daylight saving change never skips one.
      const last = Date.parse(entry.endDate);
      for (let at = Date.parse(entry.startDate); at <= last; at += DAY_MS) {
        mark(entry.userId, new Date(at).toISOString().slice(0, 10), day);
      }
    }
    for (const holiday of calendar.holidays) {
      mark(
        holiday.userId,
        holiday.date,
        holiday.name
          ? { kind: "public_holiday", name: holiday.name }
          : { kind: "away" },
      );
    }
  }
  return byUser.size ? byUser : NO_AWAY_DAYS;
}
