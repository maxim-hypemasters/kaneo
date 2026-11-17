import { expect, it } from "vite-plus/test";
import type { TimeOffEntry, TimeOffHoliday } from "@/fetchers/time-off/types";
import { awayDaysByUser, NO_AWAY_DAYS } from "./away-days";

const redacted = (
  userId: string,
  startDate: string,
  endDate: string,
): TimeOffEntry => ({
  id: `${userId}:${startDate}`,
  userId,
  startDate,
  endDate,
});

const request = (
  overrides: Partial<TimeOffEntry> & Pick<TimeOffEntry, "startDate">,
): TimeOffEntry => ({
  id: `me:${overrides.startDate}`,
  userId: "me",
  endDate: overrides.startDate,
  workspaceId: "w1",
  type: "vacation",
  status: "approved",
  days: 1,
  daysByYear: [],
  note: null,
  version: 0,
  createdBy: "me",
  statusChangedBy: null,
  statusChangedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  canEdit: true,
  canCancel: true,
  canDecide: false,
  ...overrides,
});

const calendar = (
  entries: TimeOffEntry[],
  holidays: TimeOffHoliday[] = [],
) => ({ entries, holidays });

it("counts approved and redacted entries day by day, weekends included", () => {
  const byUser = awayDaysByUser([
    calendar([
      request({ startDate: "2027-01-08", endDate: "2027-01-11" }),
      redacted("bo", "2027-01-05", "2027-01-05"),
    ]),
  ]);
  expect([...(byUser.get("me")?.keys() ?? [])]).toEqual([
    "2027-01-08",
    "2027-01-09",
    "2027-01-10",
    "2027-01-11",
  ]);
  expect(byUser.get("me")?.get("2027-01-09")).toEqual({ kind: "vacation" });
  expect(byUser.get("bo")?.get("2027-01-05")).toEqual({ kind: "away" });
});

it("never counts pending requests", () => {
  expect(
    awayDaysByUser([
      calendar([request({ startDate: "2027-01-08", status: "pending" })]),
    ]),
  ).toBe(NO_AWAY_DAYS);
});

it("has no gap across a daylight saving change", () => {
  const days = awayDaysByUser([
    calendar([redacted("bo", "2027-03-26", "2027-03-30")]),
  ]).get("bo");
  expect(days?.size).toBe(5);
  expect(days?.has("2027-03-28")).toBe(true);
});

it("names your own holidays and keeps a colleague's neutral", () => {
  const byUser = awayDaysByUser([
    calendar(
      [],
      [
        { userId: "me", date: "2027-01-06", name: "Epiphany" },
        { userId: "bo", date: "2027-01-06" },
      ],
    ),
  ]);
  expect(byUser.get("me")?.get("2027-01-06")).toEqual({
    kind: "public_holiday",
    name: "Epiphany",
  });
  expect(byUser.get("bo")?.get("2027-01-06")).toEqual({ kind: "away" });
});

it("shows a named holiday over time off, and time off over away", () => {
  const byUser = awayDaysByUser([
    calendar(
      [request({ startDate: "2027-01-05", endDate: "2027-01-07" })],
      [
        { userId: "me", date: "2027-01-06", name: "Epiphany" },
        { userId: "me", date: "2027-01-07" },
      ],
    ),
  ]);
  const days = byUser.get("me");
  expect(days?.get("2027-01-05")).toEqual({ kind: "vacation" });
  expect(days?.get("2027-01-06")).toEqual({
    kind: "public_holiday",
    name: "Epiphany",
  });
  expect(days?.get("2027-01-07")).toEqual({ kind: "vacation" });
});

it("counts an entry once when two year chunks both return it", () => {
  const entry = redacted("bo", "2026-12-31", "2027-01-01");
  const days = awayDaysByUser([calendar([entry]), calendar([entry])]).get("bo");
  expect([...(days?.keys() ?? [])]).toEqual(["2026-12-31", "2027-01-01"]);
});

it("returns the shared empty map when nobody is away", () => {
  expect(awayDaysByUser([])).toBe(NO_AWAY_DAYS);
  expect(awayDaysByUser([calendar([])])).toBe(NO_AWAY_DAYS);
});
