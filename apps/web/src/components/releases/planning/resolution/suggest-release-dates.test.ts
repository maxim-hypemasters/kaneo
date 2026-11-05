import { describe, expect, it } from "vite-plus/test";
import type { Release } from "@/types/release";
import type { ReleasePlanTask } from "@/types/release-plan";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "../preview/preview-fixtures";
import { suggestedReleaseDates } from "./suggest-release-dates";

function scheduled(
  id: string,
  end: string,
  overrides: Partial<ReleasePlanTask> = {},
) {
  const start = new Date(Date.parse(end) - 3_600_000).toISOString();
  return previewTask(id, {
    start,
    end,
    segments: [{ start, end }],
    ...overrides,
  });
}

function proposal(
  tasks: ReleasePlanTask[],
  release: Release = previewRelease,
  timeZone = "UTC",
) {
  return releasePreview(tasks, {
    timeZone,
    releaseDates: {
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    },
  });
}

describe("suggested release dates", () => {
  it("extends code freeze to the last unfinished finish and preserves the submission buffer", () => {
    const release = { ...previewRelease, submissionDate: "2026-10-31" };
    const preview = proposal(
      [
        scheduled("earlier", "2026-10-30T17:00:00Z"),
        scheduled("latest", "2026-11-02T16:00:00Z", { type: "bug" }),
      ],
      release,
    );
    expect(suggestedReleaseDates(release, {}, preview)).toEqual({
      startDate: "2026-10-26",
      codeFreezeDate: "2026-11-02",
      submissionDate: "2026-11-04",
    });
  });

  it("keeps dates that already cover the proposed work", () => {
    const release = {
      ...previewRelease,
      codeFreezeDate: "2026-11-05",
      submissionDate: "2026-11-09",
    };
    const preview = proposal(
      [scheduled("early", "2026-10-28T12:00:00Z")],
      release,
    );
    expect(suggestedReleaseDates(release, {}, preview)).toEqual({
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    });
  });

  it("uses staged dates and their buffer instead of the saved release dates", () => {
    const changes = {
      releaseDates: {
        codeFreezeDate: "2026-11-01",
        submissionDate: "2026-11-04",
      },
    };
    const preview = proposal([scheduled("late", "2026-11-03T17:00:00Z")]);
    expect(suggestedReleaseDates(previewRelease, changes, preview)).toEqual({
      startDate: "2026-10-26",
      codeFreezeDate: "2026-11-03",
      submissionDate: "2026-11-06",
    });
    expect(changes.releaseDates).toEqual({
      codeFreezeDate: "2026-11-01",
      submissionDate: "2026-11-04",
    });
  });

  it("preserves a zero-day submission buffer", () => {
    const release = {
      ...previewRelease,
      submissionDate: previewRelease.codeFreezeDate,
    };
    expect(
      suggestedReleaseDates(
        release,
        {},
        proposal([scheduled("late", "2026-11-02T17:00:00Z")], release),
      ),
    ).toEqual({
      startDate: "2026-10-26",
      codeFreezeDate: "2026-11-02",
      submissionDate: "2026-11-02",
    });
  });

  it("ignores completed history, archived work, and unscheduled rows", () => {
    const preview = proposal([
      scheduled("ready", "2026-10-28T17:00:00Z"),
      scheduled("done", "2027-01-01T17:00:00Z", { completed: true }),
      scheduled("archived", "2027-02-01T17:00:00Z", {
        reason: "archived",
      }),
      scheduled("excluded", "2027-03-01T17:00:00Z", {
        reason: "not_ready",
      }),
      previewTask("undated", { start: null, end: null, segments: [] }),
      scheduled("missing-start", "2027-04-01T17:00:00Z", { start: null }),
    ]);
    expect(suggestedReleaseDates(previewRelease, {}, preview)).toEqual({
      startDate: "2026-10-26",
      codeFreezeDate: "2026-10-29",
      submissionDate: "2026-10-30",
    });
  });

  it("does not reserve dates for staged moves still present in an older preview", () => {
    const preview = proposal([
      scheduled("staying", "2026-11-02T17:00:00Z"),
      scheduled("moved", "2027-01-01T17:00:00Z"),
    ]);
    expect(
      suggestedReleaseDates(
        previewRelease,
        { moves: [{ taskId: "moved", target: { releaseId: "next" } }] },
        preview,
      ),
    ).toEqual({
      startDate: "2026-10-26",
      codeFreezeDate: "2026-11-02",
      submissionDate: "2026-11-03",
    });
  });

  it("keeps the effective dates when all work is moved or no work is scheduled", () => {
    const dates = {
      startDate: "2026-10-26",
      codeFreezeDate: "2026-11-04",
      submissionDate: "2026-11-06",
    };
    const changes = {
      releaseDates: {
        codeFreezeDate: dates.codeFreezeDate,
        submissionDate: dates.submissionDate,
      },
      moves: [{ taskId: "moved", target: { draftKey: "new-release" } }],
    };
    expect(
      suggestedReleaseDates(
        previewRelease,
        changes,
        proposal([scheduled("moved", "2027-01-01T17:00:00Z")]),
      ),
    ).toEqual(dates);
    expect(
      suggestedReleaseDates(previewRelease, changes, proposal([])),
    ).toEqual(dates);
  });

  it.each([
    ["UTC", "2026-11-03T00:00:00.000Z", "2026-11-02"],
    ["UTC", "2026-11-03T00:00:00.001Z", "2026-11-03"],
    ["Europe/Belgrade", "2026-11-02T23:00:00.000Z", "2026-11-02"],
    ["Europe/Belgrade", "2026-11-02T23:00:00.001Z", "2026-11-03"],
    ["America/Los_Angeles", "2026-11-03T07:30:00.000Z", "2026-11-02"],
    ["Pacific/Kiritimati", "2026-11-02T12:00:00.000Z", "2026-11-03"],
  ])(
    "uses the covered finish day in %s for exclusive end %s",
    (timeZone, end, codeFreezeDate) => {
      const result = suggestedReleaseDates(
        previewRelease,
        {},
        proposal([scheduled("work", end)], previewRelease, timeZone),
      );
      expect(result.codeFreezeDate).toBe(codeFreezeDate);
    },
  );

  it.each([
    [
      "2026-03-23",
      "2026-03-26",
      "2026-03-28",
      "2026-03-29T12:00:00Z",
      "2026-03-29",
      "2026-03-31",
    ],
    [
      "2026-10-19",
      "2026-10-22",
      "2026-10-24",
      "2026-10-25T12:00:00Z",
      "2026-10-25",
      "2026-10-27",
    ],
    [
      "2026-12-21",
      "2026-12-28",
      "2026-12-30",
      "2026-12-31T12:00:00Z",
      "2026-12-31",
      "2027-01-02",
    ],
  ])(
    "preserves calendar-day buffers across DST and year boundaries from %s",
    (
      startDate,
      codeFreezeDate,
      submissionDate,
      end,
      expectedFreeze,
      expectedSubmission,
    ) => {
      const release = {
        ...previewRelease,
        startDate,
        codeFreezeDate,
        submissionDate,
      };
      expect(
        suggestedReleaseDates(
          release,
          {},
          proposal([scheduled("work", end)], release, "Europe/Belgrade"),
        ),
      ).toEqual({
        startDate,
        codeFreezeDate: expectedFreeze,
        submissionDate: expectedSubmission,
      });
    },
  );
});
