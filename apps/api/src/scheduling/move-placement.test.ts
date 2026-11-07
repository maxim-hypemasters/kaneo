import { describe, expect, it } from "vite-plus/test";
import { movePlacement } from "./move-placement";

const at = (iso: string) => new Date(iso);
// Tue 13:00–17:00 and Wed 09:00–13:00 in Berlin (UTC+1): eight hours of work.
const planned = {
  startDate: at("2026-11-10T12:00:00Z"),
  dueDate: at("2026-11-11T12:00:00Z"),
  scheduleSegments: [
    { start: "2026-11-10T12:00:00.000Z", end: "2026-11-10T16:00:00.000Z" },
    { start: "2026-11-11T08:00:00.000Z", end: "2026-11-11T12:00:00.000Z" },
  ],
};

describe("movePlacement", () => {
  it("keeps the planned effort and time of day when moved a day later", () => {
    expect(
      movePlacement(
        planned,
        { start: at("2026-11-11T12:00:00Z"), end: at("2026-11-12T12:00:00Z") },
        "Europe/Berlin",
      ),
    ).toEqual({
      startDate: at("2026-11-11T12:00:00Z"),
      dueDate: at("2026-11-12T12:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-11T12:00:00.000Z", end: "2026-11-11T16:00:00.000Z" },
        { start: "2026-11-12T08:00:00.000Z", end: "2026-11-12T12:00:00.000Z" },
      ],
    });
  });

  it("starts work dropped on a weekend on the next working morning", () => {
    expect(
      movePlacement(
        planned,
        { start: at("2026-11-14T12:00:00Z"), end: at("2026-11-15T12:00:00Z") },
        "Europe/Berlin",
      ),
    ).toEqual({
      startDate: at("2026-11-16T08:00:00Z"),
      dueDate: at("2026-11-16T16:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-16T08:00:00.000Z", end: "2026-11-16T16:00:00.000Z" },
      ],
    });
  });

  it("follows the planning timezone across a DST change", () => {
    // Friday 09:00–17:00 EDT, moved to Monday 09:00 EST.
    const friday = {
      startDate: at("2026-10-30T13:00:00Z"),
      dueDate: at("2026-10-30T21:00:00Z"),
      scheduleSegments: [
        { start: "2026-10-30T13:00:00.000Z", end: "2026-10-30T21:00:00.000Z" },
      ],
    };
    expect(
      movePlacement(
        friday,
        { start: at("2026-11-02T14:00:00Z"), end: at("2026-11-02T22:00:00Z") },
        "America/New_York",
      )?.scheduleSegments,
    ).toEqual([
      { start: "2026-11-02T14:00:00.000Z", end: "2026-11-02T22:00:00.000Z" },
    ]);
  });

  it("moves unplanned dates on the fields the task already has", () => {
    const target = {
      start: at("2026-11-20T00:00:00Z"),
      end: at("2026-11-20T00:00:00Z"),
    };
    expect(
      movePlacement(
        {
          startDate: null,
          dueDate: at("2026-11-18T00:00:00Z"),
          scheduleSegments: null,
        },
        target,
        "UTC",
      ),
    ).toEqual({
      startDate: null,
      dueDate: target.end,
      scheduleSegments: null,
    });
    expect(
      movePlacement(
        {
          startDate: at("2026-11-16T00:00:00Z"),
          dueDate: at("2026-11-18T00:00:00Z"),
          scheduleSegments: null,
        },
        { start: at("2026-11-17T00:00:00Z"), end: at("2026-11-19T00:00:00Z") },
        "UTC",
      ),
    ).toEqual({
      startDate: at("2026-11-17T00:00:00Z"),
      dueDate: at("2026-11-19T00:00:00Z"),
      scheduleSegments: null,
    });
  });

  it("refuses work that no longer fits within the planning horizon", () => {
    expect(
      movePlacement(
        {
          startDate: at("2020-01-01T00:00:00Z"),
          dueDate: at("2034-01-01T00:00:00Z"),
          scheduleSegments: [
            {
              start: "2020-01-01T00:00:00.000Z",
              end: "2034-01-01T00:00:00.000Z",
            },
          ],
        },
        { start: at("2026-11-16T00:00:00Z"), end: at("2026-11-17T00:00:00Z") },
        "UTC",
      ),
    ).toBeNull();
  });
});
