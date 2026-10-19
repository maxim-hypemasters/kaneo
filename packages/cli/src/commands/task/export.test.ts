import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { parseTransferDocument } from "../../transfer/parse-import-file.js";
import { planImport } from "../../transfer/import-plan.js";
import { runTaskExport } from "./export.js";

const { project } = resolvedTaskFixture(1);
describe("native export hierarchy round trip", () => {
  it("retains the version, portable refs, milestone metadata and existing fields", async () => {
    const base = {
      description: "Description",
      status: "planned",
      priority: "high",
      dueDate: null,
      startDate: null,
      userId: null,
      labels: [{ name: "Urgent", color: "red" }],
    };
    const document = {
      version: 2,
      project: {
        name: "Demo",
        slug: "demo",
        description: "Project",
        exportedAt: "2026-10-19T00:00:00Z",
      },
      tasks: [
        {
          ...base,
          key: "f",
          title: "Feature",
          type: "feature",
          featureKey: null,
          milestoneKey: null,
        },
        {
          ...base,
          key: "b",
          title: "Bug",
          type: "bug",
          featureKey: "f",
          milestoneKey: "m",
        },
      ],
      milestones: [
        {
          key: "m",
          featureKey: "f",
          title: "Release candidate",
          description: "Ready",
          startDate: "2026-10-20",
          endDate: "2026-11-01",
          position: 0,
        },
      ],
    };
    const run = await runCommand(
      runTaskExport({ project: Option.none(), output: Option.none() }),
      {
        "GET /api/project": () => json([project]),
        "GET /api/task/export/p1": () => json(document),
      },
    );
    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.json()).toEqual(document);
    expect(JSON.stringify(run.json())).not.toContain("targetDate");
    const parsed = Result.getOrThrow(
      parseTransferDocument(JSON.stringify(run.json()), "export.json"),
    );
    expect(parsed.hierarchy).toEqual({
      version: 2,
      milestones: document.milestones,
    });
    const plan = planImport(parsed.tasks, []);
    expect(plan.tasks).toContainEqual({ ...document.tasks[1] });
  });
});
