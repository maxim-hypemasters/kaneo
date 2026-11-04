import { afterEach, describe, expect, it } from "vite-plus/test";
import { previewTask, releasePreview } from "./preview-fixtures";
import {
  clearsPlacement,
  previewBarColumns,
  previewModel,
} from "./preview-model";

const originalTimeZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe("read-only release preview model", () => {
  it("groups by proposed assignee, orders working rows by start, and preserves current inputs", () => {
    const model = previewModel(
      releasePreview([
        previewTask("later", {
          currentAssigneeId: "sam",
          currentAssigneeName: "Sam",
          start: "2026-10-27T09:00:00Z",
          end: "2026-10-27T13:00:00Z",
          segments: [
            { start: "2026-10-27T09:00:00Z", end: "2026-10-27T13:00:00Z" },
          ],
        }),
        previewTask("earlier"),
        previewTask("other", { assigneeId: "alex", assigneeName: "Alex" }),
      ]),
      "project",
    );
    expect(model.lanes.map((lane) => lane.name)).toEqual(["Alex", "Max"]);
    expect(model.lanes[1].tasks.map((task) => task.taskId)).toEqual([
      "earlier",
      "later",
    ]);
    expect(model.lanes[1].tasks[1].currentAssigneeId).toBe("sam");
    expect(model.lanes[1].tasks[1].projectId).toBe("project");
  });
  it("separates unscheduled work from completed work lacking historical placement", () => {
    const missing = previewTask("missing", {
      start: null,
      end: null,
      segments: [],
      reason: "no_estimate",
      currentStart: "2026-10-25T09:00:00Z",
    });
    const done = previewTask("done", {
      completed: true,
      start: null,
      end: null,
      segments: [],
    });
    const archived = previewTask("archived", {
      start: null,
      end: null,
      segments: [],
      reason: "archived",
    });
    const invalid = previewTask("invalid", { start: "bad date" });
    const model = previewModel(
      releasePreview([missing, done, invalid, archived]),
      "project",
    );
    expect(model.unscheduled.map((task) => task.taskId)).toEqual([
      "missing",
      "invalid",
    ]);
    expect(model.scheduled).toEqual([]);
    expect(clearsPlacement(missing)).toBe(true);
    expect(clearsPlacement(done)).toBe(false);
    expect(
      clearsPlacement(
        previewTask("empty", { start: null, end: null, segments: [] }),
      ),
    ).toBe(false);
  });
  it("spans the dates of split work while preserving the exact schedule", () => {
    process.env.TZ = "UTC";
    const model = previewModel(
      releasePreview([
        previewTask("split", {
          end: "2026-10-27T13:00:00Z",
          segments: [
            { start: "2026-10-26T09:00:00Z", end: "2026-10-26T17:00:00Z" },
            { start: "2026-10-27T09:00:00Z", end: "2026-10-27T13:00:00Z" },
          ],
        }),
      ]),
      "project",
    );
    const task = model.scheduled[0];
    expect(task.scheduleStart.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(task.scheduleEnd.toISOString()).toBe("2026-10-27T13:00:00.000Z");
    expect(
      previewBarColumns(task, {
        rangeStart: new Date("2026-10-26T00:00:00Z"),
        days: [new Date(), new Date()],
      }),
    ).toMatchObject({ barInView: true, lineStart: 1, lineEnd: 3 });
  });
  it("fills one date column for work in the repeated DST hour", () => {
    process.env.TZ = "America/New_York";
    const task = previewTask("fall", {
      start: "2026-11-01T05:30:00Z",
      end: "2026-11-01T06:30:00Z",
      segments: [
        { start: "2026-11-01T05:30:00Z", end: "2026-11-01T06:30:00Z" },
      ],
    });
    const model = previewModel(releasePreview([task]), "project");
    expect(
      previewBarColumns(model.scheduled[0], {
        rangeStart: new Date(2026, 10, 1),
        days: [new Date(2026, 10, 1), new Date(2026, 10, 2)],
      }),
    ).toMatchObject({ barInView: true, lineStart: 1, lineEnd: 2 });
    expect(
      previewBarColumns(model.scheduled[0], {
        rangeStart: new Date(2026, 10, 2),
        days: [new Date(2026, 10, 2)],
      }),
    ).toMatchObject({ barInView: false });
  });
  it("keeps an exclusive midnight finish on the preceding date", () => {
    process.env.TZ = "America/New_York";
    const start = "2026-11-01T22:00:00Z";
    const end = "2026-11-02T05:00:00Z";
    const model = previewModel(
      releasePreview([
        previewTask("midnight", {
          start,
          end,
          segments: [{ start, end }],
        }),
      ]),
      "project",
    );
    expect(
      previewBarColumns(model.scheduled[0], {
        rangeStart: new Date(2026, 10, 1),
        days: [new Date(2026, 10, 1), new Date(2026, 10, 2)],
      }),
    ).toMatchObject({ barInView: true, lineStart: 1, lineEnd: 2 });
  });
  it("preserves one-day completed legacy dates without inventing execution hours", () => {
    process.env.TZ = "UTC";
    const model = previewModel(
      releasePreview([
        previewTask("history", {
          completed: true,
          start: "2026-10-26T00:00:00Z",
          end: "2026-10-26T00:00:00Z",
          segments: [],
        }),
      ]),
      "project",
    );
    expect(model.scheduled).toHaveLength(1);
    expect(model.scheduled[0].workSegments).toEqual([]);
    expect(
      previewBarColumns(model.scheduled[0], {
        rangeStart: new Date("2026-10-26T00:00:00Z"),
        days: [new Date()],
      }),
    ).toMatchObject({ barInView: true, lineStart: 1, lineEnd: 2 });
  });
  it("retains completed blockers and compact dependency identities", () => {
    const model = previewModel(
      releasePreview(
        [previewTask("a", { completed: true }), previewTask("b")],
        {
          dependencies: [{ blockerId: "a", blockedId: "b" }],
        },
      ),
      "project",
    );
    expect(model.spans.get("a")).toMatchObject({
      precise: true,
      completed: true,
    });
    expect(model.dependencies).toEqual([
      { id: '["a","b"]', blockerId: "a", blockedId: "b" },
    ]);
  });
});
