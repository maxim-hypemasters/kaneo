import { Option, Result } from "effect";
import { expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runTaskList } from "./list.js";

it("filters Bugs on the server and preserves their type in list JSON", async () => {
  const { project, task } = resolvedTaskFixture(1, { type: "bug" });
  const run = await runCommand(
    runTaskList({
      project: Option.none(),
      status: Option.none(),
      priority: Option.none(),
      assignee: Option.none(),
      mine: false,
      label: [],
      open: false,
      sort: Option.none(),
      order: Option.none(),
      dueBefore: Option.none(),
      dueAfter: Option.none(),
      all: false,
      limit: 50,
      type: Option.some("bug"),
      feature: Option.some("none"),
      milestone: Option.some("none"),
    }),
    {
      "GET /api/project": () => json([project]),
      "GET /api/task/tasks/p1": () =>
        json({
          data: {
            ...project,
            columns: [
              {
                id: "todo",
                slug: "to-do",
                name: "To Do",
                isFinal: false,
                tasks: [task],
              },
            ],
          },
          pagination: { total: 1, page: 1, totalPages: 1 },
        }),
    },
  );
  expect(Result.isSuccess(run.result)).toBe(true);
  const request = run.requests.find(([, path]) =>
    path.startsWith("/api/task/tasks/"),
  );
  expect(
    new URL(`https://kaneo.test${request?.[1]}`).searchParams.get("type"),
  ).toBe("bug");
  const query = new URL(`https://kaneo.test${request?.[1]}`).searchParams;
  expect(query.get("featureId")).toBe("none");
  expect(query.get("milestoneId")).toBe("none");
  expect(run.json()).toMatchObject([{ id: "t1", type: "bug" }]);
});
