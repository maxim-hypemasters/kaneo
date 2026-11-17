import type { timeOffTable } from "../database/schema";
import { countWorkdays } from "./count-workdays";
import { daysByYear, type YearDays } from "./days-by-year";
import {
  type TimeOffActions,
  type TimeOffActionViewer,
  timeOffActions,
} from "./time-off-actions";

export type TimeOffRow = typeof timeOffTable.$inferSelect;

// planning_key is internal to plan fingerprints.
export type TimeOffRequest = Omit<TimeOffRow, "planningKey"> &
  TimeOffActions & { days: number; daysByYear: YearDays[] };

export type RedactedTimeOffEntry = Pick<
  TimeOffRow,
  "id" | "userId" | "startDate" | "endDate"
>;

export type TimeOffEntry = TimeOffRequest | RedactedTimeOffEntry;

// Fields are listed one by one so a new column never reaches a response by
// accident. `holidays` are the member's calendar holidays for every year the
// row touches; days and daysByYear leave them out.
export function presentRequest(
  row: TimeOffRow,
  viewer: TimeOffActionViewer,
  holidays: ReadonlySet<string>,
): TimeOffRequest {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    type: row.type,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    days: countWorkdays(row.startDate, row.endDate, holidays),
    daysByYear: daysByYear(row, holidays),
    note: row.note,
    version: row.version,
    createdBy: row.createdBy,
    statusChangedBy: row.statusChangedBy,
    statusChangedAt: row.statusChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...timeOffActions(row, viewer),
  };
}

// Members see who is away and when. Type, status, note, days and actions
// are only for the person away and for approvers.
export function presentEntry(
  row: TimeOffRow,
  viewer: TimeOffActionViewer,
  holidays: ReadonlySet<string>,
): TimeOffEntry {
  if (row.userId === viewer.userId || viewer.canApprove) {
    return presentRequest(row, viewer, holidays);
  }
  return {
    id: row.id,
    userId: row.userId,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}
