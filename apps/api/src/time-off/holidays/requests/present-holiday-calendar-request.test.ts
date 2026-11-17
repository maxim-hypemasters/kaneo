import { describe, expect, it } from "vite-plus/test";
import {
  type HolidayCalendarRequestRow,
  presentHolidayCalendarRequest,
} from "./present-holiday-calendar-request";

const row: HolidayCalendarRequestRow = {
  id: "r1",
  workspaceId: "w1",
  userId: "u1",
  country: "DE",
  region: "BY",
  status: "pending",
  version: 2,
  statusChangedBy: "approver",
  statusChangedAt: new Date("2026-03-02T00:00:00Z"),
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-03T00:00:00Z"),
};

describe("presentHolidayCalendarRequest", () => {
  it("names the calendar asked for and keeps both timestamps", () => {
    expect(presentHolidayCalendarRequest(row, "de")).toEqual({
      id: "r1",
      workspaceId: "w1",
      userId: "u1",
      status: "pending",
      version: 2,
      calendar: {
        country: "DE",
        countryName: "Deutschland",
        region: "BY",
        regionName: "Bayern",
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  it("presents a request for no calendar with a null calendar", () => {
    expect(
      presentHolidayCalendarRequest({ ...row, country: null, region: null })
        .calendar,
    ).toBeNull();
  });
});
