import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runMilestoneCreate } from "./create.js";
import { runMilestoneEdit } from "./edit.js";
import { runMilestoneList } from "./list.js";
import { runMilestoneView } from "./view.js";
import { runMilestoneOrder } from "./order.js";
import { runMilestoneDelete } from "./delete.js";
import { resolveTaskMilestone } from "../../milestones/resolve-task-milestone.js";

const feature = resolvedTaskFixture(1, { type: "feature" });
const milestone = {
  id: "m1",
  featureId: "t1",
  title: "Ship",
  description: null,
  startDate: null,
  endDate: null,
  position: 0,
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
  progress: { total: 3, started: 2, completed: 1 },
};
const routes = {
  "GET /api/task/by-ticket-id/KAN-1": () => json(feature.task),
  "GET /api/project/p1": () => json(feature.project),
  "GET /api/milestone/feature/t1": () => json([milestone]),
  "POST /api/milestone/feature/t1": () => json(milestone),
  "GET /api/milestone/m1": () => json(milestone),
  "PATCH /api/milestone/m1": () => json(milestone),
  "DELETE /api/milestone/m1": () => json({ id: "m1" }),
  "PUT /api/milestone/feature/t1/order": () => json([milestone]),
};
describe("milestone commands", () => {
  it("creates a trimmed title in a Feature", async () => {
    const run = await runCommand(
      runMilestoneCreate({
        feature: "KAN-1",
        title: " Ship ",
        description: Option.none(),
        startDate: Option.some("2026-10-25"),
        endDate: Option.some("2026-11-01"),
      }),
      routes,
    );
    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.requests.at(-1)).toEqual([
      "POST",
      "/api/milestone/feature/t1",
      { title: "Ship", startDate: "2026-10-25", endDate: "2026-11-01" },
    ]);
    expect(run.json()).toMatchObject({
      progress: { total: 3, started: 2, completed: 1 },
    });
  });
  it("lists and gets unfiltered progress", async () => {
    const list = await runCommand(
      runMilestoneList({ feature: "KAN-1" }),
      routes,
    );
    expect(list.json()).toEqual([milestone]);
    const view = await runCommand(runMilestoneView({ id: "m1" }), routes);
    expect(view.json()).toEqual(milestone);
  });
  it("clears optional metadata with null", async () => {
    const run = await runCommand(
      runMilestoneEdit({
        id: "m1",
        title: Option.none(),
        description: Option.some(""),
        startDate: Option.some("none"),
        endDate: Option.some("none"),
      }),
      routes,
    );
    expect(run.requests.at(-1)).toEqual([
      "PATCH",
      "/api/milestone/m1",
      { description: null, startDate: null, endDate: null },
    ]);
  });
  it("reorders a complete unique list and rejects duplicates before requests", async () => {
    const run = await runCommand(
      runMilestoneOrder({ feature: "KAN-1", milestone: ["m1"] }),
      routes,
    );
    expect(run.requests.at(-1)).toEqual([
      "PUT",
      "/api/milestone/feature/t1/order",
      { milestoneIds: ["m1"] },
    ]);
    const invalid = await runCommand(
      runMilestoneOrder({ feature: "KAN-1", milestone: ["m1", "m1"] }),
      routes,
    );
    expect(Result.isFailure(invalid.result)).toBe(true);
    expect(invalid.requests).toEqual([]);
  });
  it("deletes only the milestone after explicit confirmation", async () => {
    const run = await runCommand(
      runMilestoneDelete({ id: "m1", yes: true }),
      routes,
    );
    expect(run.requests.at(-1)).toEqual([
      "DELETE",
      "/api/milestone/m1",
      undefined,
    ]);
    expect(run.json()).toEqual({ id: "m1", deleted: true });
  });
  it("rejects non-Feature owners", async () => {
    const run = await runCommand(runMilestoneList({ feature: "KAN-1" }), {
      ...routes,
      "GET /api/task/by-ticket-id/KAN-1": () =>
        json({ ...feature.task, type: "bug" }),
    });
    expect(Result.isFailure(run.result)).toBe(true);
    expect(
      run.requests.some(([, path]) => path.startsWith("/api/milestone")),
    ).toBe(false);
  });
  it("requires same-Feature assignment and resolves none without a lookup", async () => {
    const valid = await runCommand(
      resolveTaskMilestone(Option.some("m1"), "t1"),
      routes,
    );
    expect(valid.result).toEqual(Result.succeed("m1"));
    const invalid = await runCommand(
      resolveTaskMilestone(Option.some("m1"), "other"),
      routes,
    );
    expect(Result.isFailure(invalid.result)).toBe(true);
    const clear = await runCommand(
      resolveTaskMilestone(Option.some("none"), null),
      routes,
    );
    expect(clear.result).toEqual(Result.succeed(null));
    expect(clear.requests).toEqual([]);
  });
});

it("allows either date alone and omits untouched fields on edit", async () => {
  const run = await runCommand(
    runMilestoneCreate({
      feature: "KAN-1",
      title: "Ship",
      description: Option.none(),
      startDate: Option.some("2026-10-25"),
      endDate: Option.none(),
    }),
    routes,
  );
  expect(Result.isSuccess(run.result)).toBe(true);
  expect(run.requests.at(-1)).toEqual([
    "POST",
    "/api/milestone/feature/t1",
    { title: "Ship", startDate: "2026-10-25" },
  ]);
  const edit = await runCommand(
    runMilestoneEdit({
      id: "m1",
      title: Option.none(),
      description: Option.none(),
      startDate: Option.none(),
      endDate: Option.some("none"),
    }),
    routes,
  );
  expect(edit.requests.at(-1)).toEqual([
    "PATCH",
    "/api/milestone/m1",
    { endDate: null },
  ]);
});
it("rejects reversed and invalid date ranges before requests", async () => {
  for (const startDate of ["2026-11-02", "2026-02-30"]) {
    const run = await runCommand(
      runMilestoneCreate({
        feature: "KAN-1",
        title: "Ship",
        description: Option.none(),
        startDate: Option.some(startDate),
        endDate: Option.some("2026-11-01"),
      }),
      routes,
    );
    expect(Result.isFailure(run.result)).toBe(true);
    expect(run.requests).toEqual([]);
  }
});

it("creates and links selected Tasks/Bugs in one write using resolved unique IDs", async () => {
  const task = resolvedTaskFixture(2, { featureId: "t1", type: "task" });
  const bug = resolvedTaskFixture(3, {
    featureId: "t1",
    type: "bug",
    milestoneId: "previous",
  });
  const run = await runCommand(
    runMilestoneCreate({
      feature: "KAN-1",
      title: "Ship",
      description: Option.none(),
      startDate: Option.none(),
      endDate: Option.none(),
      task: ["KAN-2", "t3", "KAN-2"],
    }),
    {
      ...routes,
      "GET /api/task/by-ticket-id/KAN-2": () => json(task.task),
      "GET /api/task/t3": () => json(bug.task),
    },
  );
  expect(Result.isSuccess(run.result)).toBe(true);
  expect(run.requests.filter(([method]) => method !== "GET")).toEqual([
    [
      "POST",
      "/api/milestone/feature/t1",
      { title: "Ship", taskIds: ["t2", "t3"] },
    ],
  ]);
});
it.each([
  { type: "feature", featureId: null },
  { type: "task", featureId: "other" },
  { type: "bug", featureId: null },
])(
  "rejects an invalid selected item before creation: %j",
  async (selection) => {
    const task = resolvedTaskFixture(2, selection);
    const run = await runCommand(
      runMilestoneCreate({
        feature: "KAN-1",
        title: "Ship",
        description: Option.none(),
        startDate: Option.none(),
        endDate: Option.none(),
        task: ["KAN-2"],
      }),
      {
        ...routes,
        "GET /api/task/by-ticket-id/KAN-2": () => json(task.task),
      },
    );
    expect(Result.isFailure(run.result)).toBe(true);
    expect(run.requests.some(([method]) => method !== "GET")).toBe(false);
  },
);
it("does not create a milestone when a selected task cannot be resolved", async () => {
  const run = await runCommand(
    runMilestoneCreate({
      feature: "KAN-1",
      title: "Ship",
      description: Option.none(),
      startDate: Option.none(),
      endDate: Option.none(),
      task: ["missing"],
    }),
    routes,
  );
  expect(Result.isFailure(run.result)).toBe(true);
  expect(run.requests.some(([method]) => method !== "GET")).toBe(false);
});
