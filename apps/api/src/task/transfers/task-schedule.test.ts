import { describe, expect, it } from "vite-plus/test";
import { importedTaskDates } from "./task-schedule";

describe("importedTaskDates", () => {
  it("shows older manual dates as legacy only before the first plan", () => {
    const values = {
      startDate: "2026-10-26T09:00:00Z",
      dueDate: "2026-10-27T17:00:00Z",
    };
    const legacy = importedTaskDates(values, 0);
    expect(legacy.startDate).toEqual(new Date(values.startDate));
    expect(legacy.legacyDueDate).toEqual(new Date(values.dueDate));
    const planned = importedTaskDates(values, 1);
    expect(planned).toMatchObject({
      startDate: null,
      dueDate: null,
      legacyStartDate: new Date(values.startDate),
      legacyDueDate: new Date(values.dueDate),
    });
  });

  it("does not turn exported applied bounds into legacy or approved dates", () => {
    expect(
      importedTaskDates(
        {
          startDate: "2026-10-26T09:00:00Z",
          dueDate: "2026-10-27T17:00:00Z",
          legacyStartDate: null,
          legacyDueDate: null,
        },
        0,
      ),
    ).toEqual({
      startDate: null,
      dueDate: null,
      legacyStartDate: null,
      legacyDueDate: null,
    });
  });

  it("retains explicit legacy values independently from exported effective dates", () => {
    expect(
      importedTaskDates(
        {
          startDate: "2026-11-01T09:00:00Z",
          legacyStartDate: "2026-10-01T00:00:00Z",
        },
        4,
      ),
    ).toMatchObject({
      startDate: null,
      legacyStartDate: new Date("2026-10-01T00:00:00Z"),
    });
  });
});
