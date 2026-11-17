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

  it("takes a span set by hand exactly, dropping the planned segments", () => {
    const target = {
      start: at("2026-11-10T12:00:00Z"),
      end: at("2026-11-14T12:00:00Z"),
    };
    expect(movePlacement(planned, target, "Europe/Berlin", true)).toEqual({
      startDate: target.start,
      dueDate: target.end,
      scheduleSegments: null,
    });
    // Work with only a due date gains its start date.
    expect(
      movePlacement(
        { startDate: null, dueDate: target.end, scheduleSegments: null },
        target,
        "UTC",
        true,
      ),
    ).toEqual({
      startDate: target.start,
      dueDate: target.end,
      scheduleSegments: null,
    });
  });

  it("lays planned work out again around blocked days", () => {
    // Wednesday is away: the morning that was due then moves to Thursday.
    expect(
      movePlacement(
        planned,
        { start: at("2026-11-10T12:00:00Z"), end: at("2026-11-11T12:00:00Z") },
        "Europe/Berlin",
        false,
        new Set(["2026-11-11"]),
      ),
    ).toEqual({
      startDate: at("2026-11-10T12:00:00Z"),
      dueDate: at("2026-11-12T12:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-10T12:00:00.000Z", end: "2026-11-10T16:00:00.000Z" },
        { start: "2026-11-12T08:00:00.000Z", end: "2026-11-12T12:00:00.000Z" },
      ],
    });
  });

  it("skips a run of blocked days given in any order", () => {
    // Wednesday to Friday are away: the morning moves past the weekend.
    expect(
      movePlacement(
        planned,
        { start: at("2026-11-10T12:00:00Z"), end: at("2026-11-11T12:00:00Z") },
        "Europe/Berlin",
        false,
        ["2026-11-13", "2026-11-11", "2026-11-12", "2026-11-12"],
      ),
    ).toEqual({
      startDate: at("2026-11-10T12:00:00Z"),
      dueDate: at("2026-11-16T12:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-10T12:00:00.000Z", end: "2026-11-10T16:00:00.000Z" },
        { start: "2026-11-16T08:00:00.000Z", end: "2026-11-16T12:00:00.000Z" },
      ],
    });
  });

  it("starts work dropped on a blocked day on the next free working morning", () => {
    expect(
      movePlacement(
        planned,
        { start: at("2026-11-11T12:00:00Z"), end: at("2026-11-12T12:00:00Z") },
        "Europe/Berlin",
        false,
        ["2026-11-11"],
      ),
    ).toEqual({
      startDate: at("2026-11-12T08:00:00Z"),
      dueDate: at("2026-11-12T16:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-12T08:00:00.000Z", end: "2026-11-12T16:00:00.000Z" },
      ],
    });
  });

  it("blocks whole local days in the planning timezone", () => {
    // Eight hours dropped on a blocked Monday in New York (UTC-5).
    const day = {
      startDate: at("2026-11-13T14:00:00Z"),
      dueDate: at("2026-11-13T22:00:00Z"),
      scheduleSegments: [
        { start: "2026-11-13T14:00:00.000Z", end: "2026-11-13T22:00:00.000Z" },
      ],
    };
    expect(
      movePlacement(
        day,
        { start: at("2026-11-16T14:00:00Z"), end: at("2026-11-16T22:00:00Z") },
        "America/New_York",
        false,
        ["2026-11-16"],
      )?.scheduleSegments,
    ).toEqual([
      { start: "2026-11-17T14:00:00.000Z", end: "2026-11-17T22:00:00.000Z" },
    ]);
  });

  it("leaves hand-set spans and unplanned work on blocked days", () => {
    const target = {
      start: at("2026-11-11T00:00:00Z"),
      end: at("2026-11-11T00:00:00Z"),
    };
    const blocked = ["2026-11-11"];
    expect(
      movePlacement(planned, target, "Europe/Berlin", true, blocked),
    ).toEqual({
      startDate: target.start,
      dueDate: target.end,
      scheduleSegments: null,
    });
    expect(
      movePlacement(
        {
          startDate: null,
          dueDate: at("2026-11-09T00:00:00Z"),
          scheduleSegments: [],
        },
        target,
        "UTC",
        false,
        blocked,
      ),
    ).toEqual({ startDate: null, dueDate: target.end, scheduleSegments: [] });
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
