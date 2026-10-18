import { describe, expect, it } from "vite-plus/test";
import { releaseCountdown } from "./release-countdown";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

describe("releaseCountdown", () => {
  it("counts down to the next date in calendar days", () => {
    expect(releaseCountdown(release, "2026-09-28")).toEqual({
      key: "tasks:releases.countdown.startsIn",
      count: 3,
    });
    expect(releaseCountdown(release, "2026-10-02")).toEqual({
      key: "tasks:releases.countdown.freezeIn",
      count: 13,
    });
    expect(releaseCountdown(release, "2026-10-16")).toEqual({
      key: "tasks:releases.countdown.submissionIn",
      count: 4,
    });
    expect(releaseCountdown(release, "2026-10-27")).toEqual({
      key: "tasks:releases.countdown.submittedAgo",
      count: 7,
    });
  });

  it("names the day itself on each date", () => {
    expect(releaseCountdown(release, "2026-10-01").key).toBe(
      "tasks:releases.countdown.startsToday",
    );
    expect(releaseCountdown(release, "2026-10-15").key).toBe(
      "tasks:releases.countdown.freezeToday",
    );
    expect(releaseCountdown(release, "2026-10-20").key).toBe(
      "tasks:releases.countdown.submissionToday",
    );
  });

  it("reads a shared day as the later date", () => {
    const sameDay = {
      startDate: "2026-10-01",
      codeFreezeDate: "2026-10-01",
      submissionDate: "2026-10-05",
    };
    expect(releaseCountdown(sameDay, "2026-10-01").key).toBe(
      "tasks:releases.countdown.freezeToday",
    );
    const oneDay = { ...sameDay, submissionDate: "2026-10-01" };
    expect(releaseCountdown(oneDay, "2026-10-01").key).toBe(
      "tasks:releases.countdown.submissionToday",
    );
  });

  it("counts across a year end and a month end", () => {
    expect(
      releaseCountdown(
        {
          startDate: "2027-01-02",
          codeFreezeDate: "2027-01-10",
          submissionDate: "2027-01-12",
        },
        "2026-12-30",
      ),
    ).toEqual({ key: "tasks:releases.countdown.startsIn", count: 3 });
    expect(
      releaseCountdown(
        {
          startDate: "2026-10-20",
          codeFreezeDate: "2026-10-28",
          submissionDate: "2026-11-02",
        },
        "2026-10-24",
      ),
    ).toEqual({ key: "tasks:releases.countdown.freezeIn", count: 4 });
  });
});
