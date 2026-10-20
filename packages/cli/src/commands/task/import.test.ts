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
  it.each([2, 3])(
    "sends version %i hierarchy atomically rather than batching away references",
    async (version) => {
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
      const releases = [
        {
          key: "r",
          name: "Delivery",
          startDate: "2026-10-20",
          codeFreezeDate: "2026-10-25",
          submissionDate: "2026-11-01",
        },
      ];
      const sourceTasks =
        version === 3
          ? tasks.map((task) =>
              task.type === "feature"
                ? {
                    ...task,
                    status: null,
                    archivedAt: "2026-10-20T00:00:00Z",
                    planningSnapshots: [
                      {
                        createdAt: "2026-10-19T00:00:00Z",
                        status: "in-progress",
                        priority: "urgent",
                      },
                    ],
                  }
                : { ...task, releaseKey: "r" },
            )
          : tasks;
      const sourceMilestones =
        version === 3
          ? milestones.map((milestone) => ({
              ...milestone,
              leadId: "lead",
              status: "in-progress",
              priority: "urgent",
              releaseKey: "r",
            }))
          : milestones;
      try {
        await writeFile(
          file,
          JSON.stringify({
            version,
            project: { name: "Source", slug: "src" },
            tasks: sourceTasks,
            milestones: sourceMilestones,
            ...(version === 3 ? { releases } : {}),
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
                  tasks: sourceTasks.map((task) => ({
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
        expect(writes[0]?.[2]).toEqual({
          version,
          tasks: sourceTasks,
          milestones: sourceMilestones,
          ...(version === 3 ? { releases } : {}),
        });
        expect(run.json()).toMatchObject({ imported: 52, failed: 0 });
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  );
});
