import { eachDayOfInterval } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import { releaseMarkerDays } from "./release-marker-days";

// Oct 1 to Oct 31, 2026.
const timeline = {
  rangeStart: new Date(2026, 9, 1),
  days: eachDayOfInterval({
    start: new Date(2026, 9, 1),
    end: new Date(2026, 9, 31),
  }),
  hideWeekends: false,
};

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
) => ({ id, name: `Release ${id}`, startDate, codeFreezeDate, submissionDate });

describe("releaseMarkerDays", () => {
  it("places each date on its column, in day order", () => {
    expect(
      releaseMarkerDays(
        [release("a", "2026-10-05", "2026-10-20", "2026-10-25")],
        timeline,
      ),
    ).toEqual([
      {
        pinned: false,
        index: 4,
        date: "2026-10-05",
        releases: [
          { id: "a", name: "Release a", date: "2026-10-05", kinds: ["start"] },
        ],
      },
      {
        pinned: false,
        index: 19,
        date: "2026-10-20",
        releases: [
          {
            id: "a",
            name: "Release a",
            date: "2026-10-20",
            kinds: ["codeFreeze"],
          },
        ],
      },
      {
        pinned: false,
        index: 24,
        date: "2026-10-25",
        releases: [
          {
            id: "a",
            name: "Release a",
            date: "2026-10-25",
            kinds: ["submission"],
          },
        ],
      },
    ]);
  });

  it("merges the dates on one day, per release", () => {
    const days = releaseMarkerDays(
      [
        release("a", "2026-09-01", "2026-10-20", "2026-10-20"),
        release("b", "2026-10-20", "2026-11-02", "2026-11-09"),
      ],
      timeline,
    );

    expect(days).toEqual([
      {
        pinned: false,
        index: 19,
        date: "2026-10-20",
        releases: [
          {
            id: "a",
            name: "Release a",
            date: "2026-10-20",
            kinds: ["codeFreeze", "submission"],
          },
          { id: "b", name: "Release b", date: "2026-10-20", kinds: ["start"] },
        ],
      },
    ]);
  });

  it("leaves out dates outside the rendered days", () => {
    expect(
      releaseMarkerDays(
        [
          release("a", "2026-09-30", "2026-11-01", "2026-11-05"),
          release("b", "2026-10-01", "2026-10-31", "2026-10-31"),
        ],
        timeline,
      ).map((day) => [day.index, day.releases.map((item) => item.kinds)]),
    ).toEqual([
      [0, [["start"]]],
      [30, [["codeFreeze", "submission"]]],
    ]);
  });

  const weekdays = {
    rangeStart: new Date(2026, 9, 1), // Thursday
    days: eachDayOfInterval({
      start: new Date(2026, 9, 1),
      end: new Date(2026, 9, 31),
    }).filter((day) => day.getDay() % 6 !== 0),
    hideWeekends: true,
  };

  it("pins a date on a hidden weekend to the next working day's left edge", () => {
    const days = releaseMarkerDays(
      [
        release("a", "2026-10-02", "2026-10-03", "2026-10-04"),
        release("b", "2026-10-05", "2026-10-05", "2026-10-05"),
      ],
      weekdays,
    );

    // Fri Oct 2 is column 1; Sat and Sun share Mon Oct 5's column 2, pinned
    // before the Monday's own marker.
    expect(days.map((day) => [day.index, day.pinned])).toEqual([
      [1, false],
      [2, true],
      [2, false],
    ]);
    // Saturday's code freeze and Sunday's submission keep their own dates.
    expect(days[1].releases).toEqual([
      { id: "a", name: "Release a", date: "2026-10-03", kinds: ["codeFreeze"] },
      { id: "a", name: "Release a", date: "2026-10-04", kinds: ["submission"] },
    ]);
  });

  it("keeps each release's own weekend date on a shared pinned marker", () => {
    const days = releaseMarkerDays(
      [
        release("a", "2026-10-04", "2026-10-20", "2026-10-21"),
        release("b", "2026-09-01", "2026-10-03", "2026-10-22"),
      ],
      weekdays,
    );

    const pinned = days.filter((day) => day.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].releases).toEqual([
      { id: "a", name: "Release a", date: "2026-10-04", kinds: ["start"] },
      { id: "b", name: "Release b", date: "2026-10-03", kinds: ["codeFreeze"] },
    ]);
  });

  it("keeps a date on a shown weekend on its own unpinned column", () => {
    const days = releaseMarkerDays(
      [release("a", "2026-10-03", "2026-10-04", "2026-10-04")],
      timeline,
    );

    expect(days).toEqual([
      {
        pinned: false,
        index: 2,
        date: "2026-10-03",
        releases: [
          { id: "a", name: "Release a", date: "2026-10-03", kinds: ["start"] },
        ],
      },
      {
        pinned: false,
        index: 3,
        date: "2026-10-04",
        releases: [
          {
            id: "a",
            name: "Release a",
            date: "2026-10-04",
            kinds: ["codeFreeze", "submission"],
          },
        ],
      },
    ]);
  });
});
