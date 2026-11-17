import { describe, expect, it } from "vite-plus/test";
import { checkedDays, yearWindows } from "./checked-days";

const dayIn = (iso: string, timeZone: string) =>
  checkedDays({
    taskId: "t",
    assigneeId: "a",
    endpoints: [{ field: "dueDate", at: new Date(iso) }],
    timeZone,
  })[0]?.day;

describe("checkedDays", () => {
  it("reads each date on the calendar of the zone it was picked in", () => {
    expect(dayIn("2027-01-05T23:00:00Z", "Europe/Berlin")).toBe("2027-01-06");
    expect(dayIn("2027-01-05T23:00:00Z", "UTC")).toBe("2027-01-05");
    expect(dayIn("2027-01-06T05:00:00Z", "America/New_York")).toBe(
      "2027-01-06",
    );
  });

  it("handles the farthest offsets", () => {
    // Midnight at UTC+14 and at UTC-11.
    expect(dayIn("2027-01-05T10:00:00Z", "Pacific/Kiritimati")).toBe(
      "2027-01-06",
    );
    expect(dayIn("2027-01-06T11:00:00Z", "Pacific/Pago_Pago")).toBe(
      "2027-01-06",
    );
  });

  it("keeps midnights next to daylight saving changes on their own day", () => {
    expect(dayIn("2027-03-27T23:00:00Z", "Europe/Berlin")).toBe("2027-03-28");
    expect(dayIn("2027-10-30T22:00:00Z", "Europe/Berlin")).toBe("2027-10-31");
    expect(dayIn("2026-11-01T04:00:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
    // Santiago skips midnight: the day a browser picks starts at 01:00.
    expect(dayIn("2026-09-06T04:00:00Z", "America/Santiago")).toBe(
      "2026-09-06",
    );
  });

  it("keeps a planned end of day on that day", () => {
    // 17:00 in Berlin.
    expect(dayIn("2027-01-06T16:00:00Z", "Europe/Berlin")).toBe("2027-01-06");
  });

  it("maps every date of a task", () => {
    expect(
      checkedDays({
        taskId: "t",
        assigneeId: "a",
        endpoints: [
          { field: "startDate", at: new Date("2027-01-05T00:00:00Z") },
          { field: "dueDate", at: new Date("2027-01-07T00:00:00Z") },
        ],
        timeZone: "UTC",
      }),
    ).toEqual([
      { taskId: "t", assigneeId: "a", field: "startDate", day: "2027-01-05" },
      { taskId: "t", assigneeId: "a", field: "dueDate", day: "2027-01-07" },
    ]);
  });
});

describe("yearWindows", () => {
  it("covers the days of each year from its first to its last", () => {
    expect(
      yearWindows(["2027-03-01", "2026-12-30", "2027-01-02", "2026-12-01"]),
    ).toEqual([
      { from: "2027-01-02", to: "2027-03-01" },
      { from: "2026-12-01", to: "2026-12-30" },
    ]);
    expect(yearWindows([])).toEqual([]);
  });
});
