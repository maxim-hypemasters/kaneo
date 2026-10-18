import { describe, expect, it } from "vite-plus/test";
import { releaseMenuOptions } from "./release-menu-options";

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
) => ({ id, name: id, startDate, codeFreezeDate, submissionDate });

// Today is 2026-10-17.
const releases = [
  release("past", "2026-08-01", "2026-08-20", "2026-08-31"),
  release("later", "2026-12-01", "2026-12-15", "2026-12-20"),
  release("frozen", "2026-10-01", "2026-10-15", "2026-10-20"),
  release("soon", "2026-11-01", "2026-11-15", "2026-11-20"),
  release("current", "2026-10-10", "2026-10-25", "2026-10-30"),
];

const options = (
  current: string | null,
  featureReleaseId: string | null = null,
) =>
  releaseMenuOptions(releases, current, {
    today: "2026-10-17",
    featureReleaseId,
    labels: {
      none: "No release",
      unknown: "Unknown release",
      featureRelease: "Feature's release",
    },
    rangeOf: (option) => `${option.startDate}..${option.submissionDate}`,
  }).map(({ value, label, hint, selected, pinned }) => ({
    value,
    label,
    hint,
    selected,
    pinned,
  }));

describe("releaseMenuOptions", () => {
  it("pins no release first, then active, upcoming and past releases with their dates", () => {
    expect(options(null)).toEqual([
      {
        value: "",
        label: "No release",
        hint: undefined,
        selected: true,
        pinned: true,
      },
      {
        value: "frozen",
        label: "frozen",
        hint: "2026-10-01..2026-10-20",
        selected: false,
        pinned: undefined,
      },
      {
        value: "current",
        label: "current",
        hint: "2026-10-10..2026-10-30",
        selected: false,
        pinned: undefined,
      },
      {
        value: "soon",
        label: "soon",
        hint: "2026-11-01..2026-11-20",
        selected: false,
        pinned: undefined,
      },
      {
        value: "later",
        label: "later",
        hint: "2026-12-01..2026-12-20",
        selected: false,
        pinned: undefined,
      },
      {
        value: "past",
        label: "past",
        hint: "2026-08-01..2026-08-31",
        selected: false,
        pinned: undefined,
      },
    ]);
  });

  it("marks the current release and names the feature's", () => {
    const listed = options("soon", "current");
    expect(listed.filter(({ selected }) => selected)).toEqual([
      expect.objectContaining({ value: "soon" }),
    ]);
    expect(listed.find(({ value }) => value === "current")?.hint).toBe(
      "Feature's release",
    );
  });

  it("keeps a current release the list lacks, as unknown", () => {
    expect(options("gone").slice(0, 2)).toEqual([
      expect.objectContaining({ value: "", selected: false }),
      {
        value: "gone",
        label: "Unknown release",
        hint: undefined,
        selected: true,
        pinned: undefined,
      },
    ]);
  });
});
