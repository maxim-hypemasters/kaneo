import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runTaskImport } from "./import.js";

const { project } = resolvedTaskFixture(1);
describe("native hierarchy import", () => {
  it("sends the full versioned hierarchy atomically rather than batching away references", async () => {
    const folder = await mkdtemp(join(tmpdir(), "kaneo-milestone-transfer-"));
    const file = join(folder, "export.json");
    const tasks = [
      {
        key: "f",
        title: "Feature",
        type: "feature",
        featureKey: null,
        milestoneKey: null,
        status: "planned",
        labels: [],
      },
      ...Array.from({ length: 51 }, (_, i) => ({
        key: `b${i}`,
        title: `Bug ${i}`,
        type: "bug",
        featureKey: "f",
        milestoneKey: "m",
        status: "planned",
        labels: [{ name: "Bug", color: "red" }],
      })),
    ];
    const milestones = [
      {
        key: "m",
        featureKey: "f",
        title: "Ship",
        description: null,
        startDate: null,
        endDate: null,
        position: 0,
      },
    ];
    try {
      await writeFile(
        file,
        JSON.stringify({
          version: 2,
          project: { name: "Source", slug: "src" },
          tasks,
          milestones,
        }),
      );
      const run = await runCommand(
        runTaskImport({
          file,
          project: Option.none(),
          dryRun: false,
          yes: true,
        }),
        {
          "GET /api/project": () => json([project]),
          "GET /api/column/p1": () => json([]),
          "POST /api/task/import/p1": () =>
            json({
              results: {
                total: tasks.length,
                successful: tasks.length,
                failed: 0,
                tasks: tasks.map((task) => ({
                  success: true,
                  task: {
                    id: task.key,
                    title: task.title,
                    status: task.status,
                  },
                })),
              },
            }),
        },
      );
      expect(Result.isSuccess(run.result)).toBe(true);
      const writes = run.requests.filter(([method]) => method === "POST");
      expect(writes).toHaveLength(1);
      expect(writes[0]?.[2]).toEqual({ version: 2, tasks, milestones });
      expect(run.json()).toMatchObject({ imported: 52, failed: 0 });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
