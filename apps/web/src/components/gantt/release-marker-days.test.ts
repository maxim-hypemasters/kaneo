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
        index: 4,
        date: "2026-10-05",
        releases: [{ id: "a", name: "Release a", kinds: ["start"] }],
      },
      {
        index: 19,
        date: "2026-10-20",
        releases: [{ id: "a", name: "Release a", kinds: ["codeFreeze"] }],
      },
      {
        index: 24,
        date: "2026-10-25",
        releases: [{ id: "a", name: "Release a", kinds: ["submission"] }],
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
        index: 19,
        date: "2026-10-20",
        releases: [
          { id: "a", name: "Release a", kinds: ["codeFreeze", "submission"] },
          { id: "b", name: "Release b", kinds: ["start"] },
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
});
