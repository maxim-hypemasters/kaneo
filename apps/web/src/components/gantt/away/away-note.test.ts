import { expect, it } from "vite-plus/test";
import {
  formatReleaseDate,
  formatReleaseRange,
} from "@/lib/releases/release-date";
import { awayNoteDates } from "./away-note";

const rangeStart = new Date(2027, 0, 4);
const today = "2027-01-01";
const runs = [
  { from: 1, to: 4, kind: "vacation" as const },
  { from: 7, to: 8, kind: "away" as const },
];

it("lists each run's days", () => {
  expect(awayNoteDates(runs, { rangeStart }, today)).toBe(
    `${formatReleaseRange("2027-01-05", "2027-01-07", { today })}, ${formatReleaseDate("2027-01-11", { today })}`,
  );
});

it("adds each run's label when asked", () => {
  expect(
    awayNoteDates(runs.slice(1), { rangeStart }, today, (run) => run.kind),
  ).toBe(`${formatReleaseDate("2027-01-11", { today })} (away)`);
});
