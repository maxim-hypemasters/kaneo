import { describe, expect, it } from "vite-plus/test";
import { compactTaskTracks } from "./compact-task-tracks";
import type { ScheduledLeaf } from "./gantt-types";

function task(
  id: string,
  start: string,
  end: string,
  values: Partial<ScheduledLeaf> = {},
) {
  return {
    id,
    scheduleStart: new Date(start),
    scheduleEnd: new Date(end),
    ...values,
  } as ScheduledLeaf;
}
const ids = (tracks: ReturnType<typeof compactTaskTracks>) =>
  tracks.map((track) => track.map((item) => item.id));

describe("Compact Gantt rows", () => {
  it("shares a row for disjoint days and stacks overlapping and same-day bars", () => {
    const tasks = [
      task("later", "2026-10-11T00:00", "2026-10-12T00:00"),
      task("overlap", "2026-10-05T00:00", "2026-10-15T00:00"),
      task("first", "2026-10-01T00:00", "2026-10-10T00:00"),
      task("same-day", "2026-10-10T00:00", "2026-10-10T00:00"),
    ];
    expect(ids(compactTaskTracks(tasks, false))).toEqual([
      ["first", "later"],
      ["overlap"],
      ["same-day"],
    ]);
    expect(tasks[0]!.id).toBe("later");
  });

  it("puts a later task in the first row that is free", () => {
    expect(
      ids(
        compactTaskTracks(
          [
            task("a", "2026-10-01T00:00", "2026-10-03T00:00"),
            task("b", "2026-10-02T00:00", "2026-10-08T00:00"),
            task("c", "2026-10-04T00:00", "2026-10-05T00:00"),
            task("d", "2026-10-09T00:00", "2026-10-09T00:00"),
          ],
          false,
        ),
      ),
    ).toEqual([["a", "c", "d"], ["b"]]);
  });

  it("keeps planned work that shares a day apart, and lets it end at midnight", () => {
    const planned = { scheduleApplied: true };
    expect(
      ids(
        compactTaskTracks(
          [
            task("morning", "2026-10-01T09:00", "2026-10-01T11:00", planned),
            task("afternoon", "2026-10-01T13:00", "2026-10-01T15:00", planned),
            task(
              "to-midnight",
              "2026-10-02T09:00",
              "2026-10-03T00:00",
              planned,
            ),
            task("next-day", "2026-10-03T09:00", "2026-10-03T10:00", planned),
          ],
          false,
        ),
      ),
    ).toEqual([["morning", "to-midnight", "next-day"], ["afternoon"]]);
  });

  it("gives every task its own row on phones", () => {
    expect(
      ids(
        compactTaskTracks(
          [
            task("a", "2026-10-01T00:00", "2026-10-02T00:00"),
            task("b", "2026-10-05T00:00", "2026-10-06T00:00"),
          ],
          true,
        ),
      ),
    ).toEqual([["a"], ["b"]]);
  });
});
