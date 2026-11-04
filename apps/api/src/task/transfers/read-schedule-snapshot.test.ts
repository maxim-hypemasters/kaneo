import { describe, expect, it } from "vite-plus/test";
import { readScheduleSnapshot } from "./read-schedule-snapshot";

describe("readScheduleSnapshot", () => {
  it("preserves migration history from PostgreSQL timestamp JSON", () => {
    const value = readScheduleSnapshot(
      { source: "manual", startDate: "2026-10-26T09:00:00", dueDate: null },
      new Date("2026-10-24T00:00:00Z"),
    );
    expect(value.success && value.data).toEqual({
      source: "legacy",
      startDate: "2026-10-26T09:00:00.000Z",
      dueDate: null,
      createdAt: "2026-10-24T00:00:00.000Z",
    });
  });

  it("retains explicit timezone offsets as canonical UTC", () => {
    const value = readScheduleSnapshot(
      {
        source: "import",
        startDate: null,
        dueDate: "2026-10-26T09:00:00+02:00",
      },
      new Date("2026-10-24T00:00:00Z"),
    );
    expect(value.success && value.data.dueDate).toBe(
      "2026-10-26T07:00:00.000Z",
    );
  });

  it("rejects malformed entries instead of fabricating dates", () => {
    expect(
      readScheduleSnapshot(
        { source: "manual", startDate: "invalid", dueDate: null },
        new Date(),
      ).success,
    ).toBe(false);
  });
});
