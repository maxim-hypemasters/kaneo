import { describe, expect, it } from "vite-plus/test";
import { compactTaskTracks, rememberTracks } from "./compact-task-tracks";
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

  describe("with weekends hidden", () => {
    // 2026-09-05 is a Saturday.
    const saturday = task("sat", "2026-09-05T00:00", "2026-09-05T00:00");
    const sunday = task("sun", "2026-09-06T00:00", "2026-09-06T00:00");
    const weekend = task("weekend", "2026-09-05T00:00", "2026-09-06T00:00");
    const monday = task("mon", "2026-09-07T00:00", "2026-09-08T00:00");

    it("keeps a weekend-only bar off the track of the Monday bar it is drawn on", () => {
      expect(ids(compactTaskTracks([saturday, monday], false))).toEqual([
        ["sat", "mon"],
      ]);
      expect(
        ids(compactTaskTracks([saturday, monday], false, undefined, true)),
      ).toEqual([["sat"], ["mon"]]);
      expect(
        ids(compactTaskTracks([weekend, monday], false, undefined, true)),
      ).toEqual([["weekend"], ["mon"]]);
    });

    it("stacks a Saturday-only and a Sunday-only bar, both drawn on Monday", () => {
      expect(ids(compactTaskTracks([saturday, sunday], false))).toEqual([
        ["sat", "sun"],
      ]);
      expect(
        ids(compactTaskTracks([saturday, sunday], false, undefined, true)),
      ).toEqual([["sat"], ["sun"]]);
    });

    it("lets bars that only overlap on hidden days share a track", () => {
      const tasks = [
        task("fri-sun", "2026-09-04T00:00", "2026-09-06T00:00"),
        task("sat-mon", "2026-09-05T00:00", "2026-09-07T00:00"),
      ];
      expect(ids(compactTaskTracks(tasks, false))).toEqual([
        ["fri-sun"],
        ["sat-mon"],
      ]);
      expect(ids(compactTaskTracks(tasks, false, undefined, true))).toEqual([
        ["fri-sun", "sat-mon"],
      ]);
    });

    it("remembers the days a bar is drawn on", () => {
      const tracks = compactTaskTracks(
        [saturday, monday],
        false,
        undefined,
        true,
      );
      const memory = rememberTracks(tracks, true);
      expect(memory.get("sat")).toEqual({
        track: 0,
        firstDay: new Date("2026-09-07T00:00").getTime(),
        lastDay: new Date("2026-09-07T00:00").getTime(),
      });
      expect(
        ids(compactTaskTracks([saturday, monday], false, memory, true)),
      ).toEqual([["sat"], ["mon"]]);
    });
  });

  describe("after an edit", () => {
    const opened = [
      task("a", "2026-10-01T00:00", "2026-10-03T00:00"),
      task("b", "2026-10-02T00:00", "2026-10-08T00:00"),
      task("c", "2026-10-05T00:00", "2026-10-06T00:00"),
      task("d", "2026-10-10T00:00", "2026-10-12T00:00"),
    ];
    // a, c, d share the first track; b overlaps a and c.
    const memory = rememberTracks(compactTaskTracks(opened, false));
    const edit = (id: string, start: string, end: string) =>
      opened.map((item) => (item.id === id ? task(id, start, end) : item));

    it("keeps every bar on its track when the edited one still fits", () => {
      // Packed afresh, b would now take the first track.
      expect(
        ids(
          compactTaskTracks(
            edit("a", "2026-10-03T00:00", "2026-10-04T00:00"),
            false,
            memory,
          ),
        ),
      ).toEqual([["a", "c", "d"], ["b"]]);
    });

    it("moves only the edited bar when it runs into a neighbour", () => {
      expect(
        ids(
          compactTaskTracks(
            edit("c", "2026-10-05T00:00", "2026-10-11T00:00"),
            false,
            memory,
          ),
        ),
      ).toEqual([["a", "d"], ["b"], ["c"]]);
      expect(
        ids(
          compactTaskTracks(
            edit("a", "2026-10-11T00:00", "2026-10-11T00:00"),
            false,
            memory,
          ),
        ),
      ).toEqual([
        ["c", "d"],
        ["b", "a"],
      ]);
    });

    it("puts new tasks in the first track with room", () => {
      expect(
        ids(
          compactTaskTracks(
            [
              ...opened.filter((item) => item.id !== "b"),
              task("e", "2026-10-07T00:00", "2026-10-07T00:00"),
              task("f", "2026-10-04T00:00", "2026-10-11T00:00"),
            ],
            false,
            memory,
          ),
        ),
      ).toEqual([["a", "c", "e", "d"], ["f"]]);
    });

    it("closes up a track left empty", () => {
      const stacked = ["x", "y", "z"].map((id) =>
        task(id, "2026-10-01T00:00", "2026-10-05T00:00"),
      );
      expect(
        ids(
          compactTaskTracks(
            stacked.filter((item) => item.id !== "y"),
            false,
            rememberTracks(compactTaskTracks(stacked, false)),
          ),
        ),
      ).toEqual([["x"], ["z"]]);
    });

    it("keeps phone rows in place too", () => {
      const phone = rememberTracks(compactTaskTracks(opened, true));
      expect(
        ids(
          compactTaskTracks(
            edit("a", "2026-10-20T00:00", "2026-10-21T00:00"),
            true,
            phone,
          ),
        ),
      ).toEqual([["a"], ["b"], ["c"], ["d"]]);
    });
  });
});
