import { describe, expect, it } from "vite-plus/test";
import { releasePhase } from "./release-phase.js";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-20",
  submissionDate: "2026-10-24",
};

describe("releasePhase", () => {
  it.each([
    ["2026-09-30", "upcoming"],
    ["2026-10-01", "in-progress"],
    ["2026-10-19", "in-progress"],
    ["2026-10-20", "code-freeze"],
    ["2026-10-24", "code-freeze"],
    ["2026-10-25", "past-submission"],
  ])("is %s → %s", (today, phase) => {
    expect(releasePhase(release, today)).toBe(phase);
  });

  it("is in code freeze when all three dates are today", () => {
    const day = "2026-10-07";
    expect(
      releasePhase(
        { startDate: day, codeFreezeDate: day, submissionDate: day },
        day,
      ),
    ).toBe("code-freeze");
  });
});
