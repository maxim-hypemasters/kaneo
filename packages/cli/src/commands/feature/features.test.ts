import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runFeatureArchive } from "./archive.js";
import { runFeatureList } from "./list.js";

const feature = resolvedTaskFixture(1, {
  type: "feature",
  status: null,
  priority: null,
  archivedAt: null,
});
describe("Feature library CLI", () => {
  it("lists a bounded archived Feature page with knowledge metadata", async () => {
    const data = [
      {
        id: "t1",
        title: "Combat",
        number: 1,
        description: "Knowledge",
        archivedAt: "2026-10-20T00:00:00Z",
        labels: [],
        milestoneCount: 2,
      },
    ];
    const run = await runCommand(
      runFeatureList({
        project: Option.none(),
        archived: true,
        search: Option.some("Combat"),
        page: 2,
        limit: 25,
      }),
      {
        "GET /api/project": () => json([feature.project]),
        "GET /api/task/feature-library/p1": () =>
          json({
            data,
            pagination: { total: 26, page: 2, limit: 25, totalPages: 2 },
          }),
      },
    );
    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.json()).toMatchObject({ data });
    expect(run.requests).toContainEqual([
      "GET",
      "/api/task/feature-library/p1?archived=true&search=Combat&page=2&limit=25",
      undefined,
    ]);
  });
  it.each([true, false])(
    "archives/restores with a narrow request (%s)",
    async (archived) => {
      const run = await runCommand(
        runFeatureArchive({ feature: "KAN-1", archived }),
        {
          "GET /api/task/by-ticket-id/KAN-1": () => json(feature.task),
          "GET /api/project/p1": () => json(feature.project),
          "PUT /api/task/t1/feature-archive": () =>
            json({
              id: "t1",
              archivedAt: archived ? "2026-10-20T00:00:00Z" : null,
            }),
        },
      );
      expect(Result.isSuccess(run.result)).toBe(true);
      expect(run.requests.filter(([method]) => method === "PUT")).toEqual([
        ["PUT", "/api/task/t1/feature-archive", { archived }],
      ]);
    },
  );
});
