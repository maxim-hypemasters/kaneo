import { describe, expect, it } from "vite-plus/test";
import { HOLIDAY_DATA_VERSION } from "./holiday-data-version";
import { holidayRevision } from "./holiday-revision";

describe("holidayRevision", () => {
  it("is undefined without calendars", () => {
    expect(holidayRevision([])).toBeUndefined();
  });

  it("lists the data version and each member's calendar by user id", () => {
    expect(
      holidayRevision([
        { userId: "u2", country: "DE", region: "BY" },
        { userId: "u1", country: "FR", region: null },
      ]),
    ).toBe(`${HOLIDAY_DATA_VERSION}|u1:FR:,u2:DE:BY`);
  });

  it("changes when a calendar changes", () => {
    expect(
      holidayRevision([{ userId: "u1", country: "DE", region: null }]),
    ).not.toBe(
      holidayRevision([{ userId: "u1", country: "DE", region: "BY" }]),
    );
  });
});
