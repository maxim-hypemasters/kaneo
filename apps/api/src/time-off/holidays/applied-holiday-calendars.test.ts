import { describe, expect, it } from "vite-plus/test";
import { appliedHolidayCalendars } from "./applied-holiday-calendars";
import { holidayRevision } from "./holiday-revision";

describe("appliedHolidayCalendars", () => {
  it("drops No calendar rows and keeps the rest in order", () => {
    expect(
      appliedHolidayCalendars([
        { userId: "u1", country: "DE", region: "BY" },
        { userId: "u2", country: null, region: null },
        { userId: "u3", country: "FR", region: null },
      ]),
    ).toEqual([
      { userId: "u1", country: "DE", region: "BY" },
      { userId: "u3", country: "FR", region: null },
    ]);
  });

  it("leaves the plan revision as if the member had no row", () => {
    const withNone = appliedHolidayCalendars([
      { userId: "u1", country: "DE", region: null },
      { userId: "u2", country: null, region: null },
    ]);
    expect(holidayRevision(withNone)).toBe(
      holidayRevision([{ userId: "u1", country: "DE", region: null }]),
    );
    expect(
      holidayRevision(
        appliedHolidayCalendars([
          { userId: "u2", country: null, region: null },
        ]),
      ),
    ).toBeUndefined();
  });
});
