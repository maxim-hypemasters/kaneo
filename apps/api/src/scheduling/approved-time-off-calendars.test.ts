import { describe, expect, it } from "vite-plus/test";
import {
  timeOffInterval,
  withApprovedTimeOff,
} from "./approved-time-off-calendars";
import type { PlanningCalendar } from "./engine/types";
import { uniformPlanningCalendar } from "./uniform-calendar";

const calendar = (
  assigneeId: string,
  timeZone = "UTC",
  timeOff: PlanningCalendar["timeOff"] = [],
): PlanningCalendar => ({
  ...uniformPlanningCalendar(assigneeId, timeZone),
  timeOff,
});

describe("timeOffInterval", () => {
  it("blocks a whole UTC day, and inclusive multi-day ranges", () => {
    expect(
      timeOffInterval(
        { startDate: "2027-01-04", endDate: "2027-01-04" },
        "UTC",
      ),
    ).toEqual({
      start: "2027-01-04T00:00:00.000Z",
      end: "2027-01-05T00:00:00.000Z",
    });
    expect(
      timeOffInterval(
        { startDate: "2027-01-04", endDate: "2027-01-06" },
        "UTC",
      ),
    ).toEqual({
      start: "2027-01-04T00:00:00.000Z",
      end: "2027-01-07T00:00:00.000Z",
    });
  });

  it("uses local midnights in a timezone ahead of UTC", () => {
    expect(
      timeOffInterval(
        { startDate: "2027-01-05", endDate: "2027-01-05" },
        "Asia/Tokyo",
      ),
    ).toEqual({
      start: "2027-01-04T15:00:00.000Z",
      end: "2027-01-05T15:00:00.000Z",
    });
  });

  it("follows the offset change across a spring-forward weekend", () => {
    expect(
      timeOffInterval(
        { startDate: "2027-03-13", endDate: "2027-03-14" },
        "America/New_York",
      ),
    ).toEqual({
      start: "2027-03-13T05:00:00.000Z",
      end: "2027-03-15T04:00:00.000Z",
    });
  });

  it("gives a skipped civil date no length and does not stretch a range over it", () => {
    expect(
      timeOffInterval(
        { startDate: "2011-12-30", endDate: "2011-12-30" },
        "Pacific/Apia",
      ),
    ).toEqual({
      start: "2011-12-30T10:00:00.000Z",
      end: "2011-12-30T10:00:00.000Z",
    });
    expect(
      timeOffInterval(
        { startDate: "2011-12-29", endDate: "2011-12-30" },
        "Pacific/Apia",
      ),
    ).toEqual({
      start: "2011-12-29T10:00:00.000Z",
      end: "2011-12-30T10:00:00.000Z",
    });
  });
});

describe("withApprovedTimeOff", () => {
  it("returns the same array when there is no approved time off", () => {
    const calendars = [calendar("ana"), calendar("ben")];
    expect(withApprovedTimeOff(calendars, [])).toBe(calendars);
  });

  it("adds ranges to their member's calendar after the work-calendar intervals", () => {
    const existing = {
      start: "2027-01-08T09:00:00Z",
      end: "2027-01-08T12:00:00Z",
    };
    const ana = calendar("ana", "UTC", [existing]);
    const ben = calendar("ben");
    const result = withApprovedTimeOff(
      [ana, ben],
      [
        { userId: "ana", startDate: "2027-01-04", endDate: "2027-01-04" },
        { userId: "ana", startDate: "2027-01-06", endDate: "2027-01-07" },
      ],
    );
    expect(result[0]).toEqual({
      ...ana,
      timeOff: [
        existing,
        { start: "2027-01-04T00:00:00.000Z", end: "2027-01-05T00:00:00.000Z" },
        { start: "2027-01-06T00:00:00.000Z", end: "2027-01-08T00:00:00.000Z" },
      ],
    });
    expect(result[1]).toBe(ben);
    expect(ana.timeOff).toEqual([existing]);
  });

  it("places each range in its own calendar's timezone", () => {
    const result = withApprovedTimeOff(
      [calendar("ana", "Asia/Tokyo"), calendar("ben", "America/New_York")],
      [
        { userId: "ana", startDate: "2027-01-05", endDate: "2027-01-05" },
        { userId: "ben", startDate: "2027-01-05", endDate: "2027-01-05" },
      ],
    );
    expect(result.map((item) => item.timeOff)).toEqual([
      [{ start: "2027-01-04T15:00:00.000Z", end: "2027-01-05T15:00:00.000Z" }],
      [{ start: "2027-01-05T05:00:00.000Z", end: "2027-01-06T05:00:00.000Z" }],
    ]);
  });

  it("ignores ranges for people without a calendar and ranges with no local day", () => {
    const apia = calendar("ana", "Pacific/Apia");
    const result = withApprovedTimeOff(
      [apia],
      [
        { userId: "ana", startDate: "2011-12-30", endDate: "2011-12-30" },
        { userId: "nobody", startDate: "2027-01-04", endDate: "2027-01-04" },
      ],
    );
    expect(result).toEqual([apia]);
    expect(result[0]).toBe(apia);
  });
});
