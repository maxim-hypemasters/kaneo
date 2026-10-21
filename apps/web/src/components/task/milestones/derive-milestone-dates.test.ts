import { describe, expect, it } from "vite-plus/test";
import { deriveMilestoneDates } from "./derive-milestone-dates";

describe("derived milestone dates", () => {
  it("preserves four-digit years in calendar-date responses", () => {
    expect(
      deriveMilestoneDates(
        [
          {
            type: "task",
            startDate: "0001-11-02T12:00:00Z",
            dueDate: "0999-11-06T12:00:00Z",
          },
        ],
        "UTC",
      ),
    ).toEqual({ startDate: "0001-11-02", endDate: "0999-11-06" });
  });
  it("combines Tasks and Bugs, including completed work, while normalizing reversed and single-date schedules", () => {
    expect(
      deriveMilestoneDates(
        [
          {
            type: "task",
            status: "done",
            startDate: "2026-11-06T12:00:00Z",
            dueDate: "2026-11-02T12:00:00Z",
          },
          { type: "bug", startDate: null, dueDate: "2026-11-10T12:00:00Z" },
          { type: "task", startDate: "2026-11-03T12:00:00Z", dueDate: null },
        ],
        "UTC",
      ),
    ).toEqual({ startDate: "2026-11-02", endDate: "2026-11-10" });
  });
  it("ignores archived items, Features, undated work and invalid dates", () => {
    expect(
      deriveMilestoneDates(
        [
          {
            type: "task",
            status: "archived",
            startDate: "2026-11-01T00:00:00Z",
          },
          {
            type: "bug",
            archivedAt: "2026-11-01T00:00:00Z",
            dueDate: "2026-11-30T00:00:00Z",
          },
          { type: "feature", startDate: "2026-11-01T00:00:00Z" },
          { type: "task", startDate: "invalid", dueDate: null },
          { type: "bug", startDate: null, dueDate: null },
        ],
        "UTC",
      ),
    ).toEqual({ startDate: null, endDate: null });
    expect(deriveMilestoneDates([], "UTC")).toEqual({
      startDate: null,
      endDate: null,
    });
  });
  it("uses viewer calendar dates across midnight and the DST transition", () => {
    const tasks = [
      {
        type: "task",
        startDate: "2026-03-08T04:30:00Z",
        dueDate: "2026-03-08T07:30:00Z",
      },
    ];
    expect(deriveMilestoneDates(tasks, "America/New_York")).toEqual({
      startDate: "2026-03-07",
      endDate: "2026-03-08",
    });
    expect(deriveMilestoneDates(tasks, "UTC")).toEqual({
      startDate: "2026-03-08",
      endDate: "2026-03-08",
    });
  });
});
