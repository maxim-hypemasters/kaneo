import { describe, expect, it } from "vite-plus/test";
import { lastScheduledInstant, scheduleDayBlocks } from "./schedule-geometry";

const at = (day: number, hour: number) => new Date(2026, 8, day, hour);
const rangeStart = new Date(2026, 8, 1);

describe("scheduleDayBlocks", () => {
  it("fills whole days and merges consecutive ones", () => {
    expect(
      scheduleDayBlocks(
        [
          { start: at(2, 13), end: at(2, 17) },
          { start: at(3, 9), end: at(3, 11) },
        ],
        rangeStart,
        30,
      ),
    ).toEqual([{ from: 1, to: 3 }]);
  });

  it("keeps days without work as gaps", () => {
    // Friday afternoon and Monday morning.
    expect(
      scheduleDayBlocks(
        [
          { start: at(4, 13), end: at(4, 17) },
          { start: at(7, 9), end: at(7, 13) },
        ],
        rangeStart,
        30,
      ),
    ).toEqual([
      { from: 3, to: 4 },
      { from: 6, to: 7 },
    ]);
  });

  it("ends work that finishes at midnight on the day before", () => {
    expect(
      scheduleDayBlocks([{ start: at(2, 20), end: at(3, 0) }], rangeStart, 30),
    ).toEqual([{ from: 1, to: 2 }]);
    expect(lastScheduledInstant(at(2, 20), at(3, 0))).toEqual(
      new Date(at(3, 0).getTime() - 1),
    );
  });

  it("clips blocks to the rendered days", () => {
    expect(
      scheduleDayBlocks(
        [
          { start: at(0, 9), end: at(1, 17) },
          { start: at(3, 9), end: at(3, 17) },
        ],
        rangeStart,
        2,
      ),
    ).toEqual([{ from: 0, to: 1 }]);
  });
});
