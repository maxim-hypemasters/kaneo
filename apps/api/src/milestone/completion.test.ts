import { describe, expect, it } from "vite-plus/test";
import { milestoneStatus } from "./completion";

describe("derived milestone status", () => {
  it.each([
    [0, 0, 0, "to-do"],
    [2, 0, 0, "to-do"],
    [2, 1, 0, "in-progress"],
    [2, 0, 1, "in-progress"],
    [2, 1, 1, "in-progress"],
    [2, 2, 0, "done"],
  ])(
    "classifies %i eligible, %i completed and %i active as %s",
    (total, done, active, expected) => {
      expect(
        milestoneStatus(total as number, done as number, active as number),
      ).toBe(expected);
    },
  );
});
