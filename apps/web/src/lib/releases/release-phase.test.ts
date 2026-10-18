import { describe, expect, it } from "vite-plus/test";
import { releasePhase } from "./release-phase";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-20",
  submissionDate: "2026-10-31",
};

describe("releasePhase", () => {
  it.each([
    ["2026-09-30", "upcoming"],
    ["2026-10-01", "inProgress"],
    ["2026-10-19", "inProgress"],
    ["2026-10-20", "codeFreeze"],
    ["2026-10-31", "codeFreeze"],
    ["2026-11-01", "pastSubmission"],
  ])("on %s is %s", (today, phase) => {
    expect(releasePhase(release, today)).toBe(phase);
  });

  it("goes straight to code freeze when it starts on the freeze day", () => {
    const sameDay = {
      startDate: "2026-10-20",
      codeFreezeDate: "2026-10-20",
      submissionDate: "2026-10-20",
    };
    expect(releasePhase(sameDay, "2026-10-19")).toBe("upcoming");
    expect(releasePhase(sameDay, "2026-10-20")).toBe("codeFreeze");
    expect(releasePhase(sameDay, "2026-10-21")).toBe("pastSubmission");
  });
});
