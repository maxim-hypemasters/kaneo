import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { planImport } from "./import-plan.js";
import { parseTransferDocument } from "./parse-import-file.js";

const task = {
  key: "task",
  title: "Estimated work",
  type: "bug",
  estimateSeconds: 5400,
  startDate: "2026-10-26T09:00:00.000Z",
  dueDate: "2026-10-26T10:30:00.000Z",
  legacyStartDate: null,
  legacyDueDate: "2026-10-28T00:00:00.000Z",
  scheduleSnapshots: [
    {
      source: "applied",
      startDate: "2026-10-26T09:00:00.000Z",
      dueDate: "2026-10-26T10:30:00.000Z",
      assigneeId: "member",
      segments: [
        { start: "2026-10-26T09:00:00.000Z", end: "2026-10-26T10:30:00.000Z" },
      ],
      sourceRevision: "revision",
    },
  ],
};

describe("native v4 schedule metadata", () => {
  it("preserves canonical effort, explicit legacy nulls, and informational history", () => {
    const document = Result.getOrThrow(
      parseTransferDocument(
        JSON.stringify({
          version: 4,
          milestones: [],
          releases: [],
          tasks: [task],
        }),
        "v4.json",
      ),
    );
    expect(document.hierarchy?.version).toBe(4);
    expect(planImport(document.tasks, []).tasks[0]).toMatchObject({
      estimateSeconds: 5400,
      legacyStartDate: null,
      legacyDueDate: task.legacyDueDate,
      scheduleSnapshots: task.scheduleSnapshots,
    });
  });

  it.each([
    { estimateSeconds: 61 },
    { estimateSeconds: "1h" },
    { scheduleSnapshots: [{ startDate: "bad", dueDate: null }] },
  ])("rejects invalid metadata instead of dropping it", (patch) => {
    expect(
      Result.isFailure(
        parseTransferDocument(
          JSON.stringify({
            version: 4,
            milestones: [],
            tasks: [{ ...task, ...patch }],
          }),
          "invalid.json",
        ),
      ),
    ).toBe(true);
  });
});
