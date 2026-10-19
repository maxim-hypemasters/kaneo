import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runTaskEdit } from "./edit.js";

const feature = resolvedTaskFixture(1, { type: "feature" });
const task = resolvedTaskFixture(3);

const none = {
  title: Option.none(),
  description: Option.none(),
  priority: Option.none(),
  due: Option.none(),
  start: Option.none(),
  addLabel: [],
  removeLabel: [],
  type: Option.none(),
  feature: Option.none(),
  release: Option.none(),
};

const routes = {
  "GET /api/task/by-ticket-id/KAN-1": () => json(feature.task),
  "GET /api/task/by-ticket-id/KAN-3": () => json(task.task),
  "GET /api/task/t1": () => json({ ...feature.task, releaseId: "r1" }),
  "GET /api/task/t3": () => json({ ...task.task, featureId: "t1" }),
  "GET /api/project/p1": () => json(feature.project),
  "GET /api/column/p1": () => json([]),
  "GET /api/label/task/t1": () => json([]),
  "GET /api/label/task/t3": () => json([]),
  "GET /api/release/project/p1": () => json([releaseFixture("r1", "2.4")]),
  "PUT /api/task/release/t1": () =>
    json({ id: "t1", releaseId: "r1", movedTaskIds: ["t2", "t3"] }),
  "PUT /api/task/release/t3": () =>
    json({ id: "t3", releaseId: null, movedTaskIds: [] }),
  "PUT /api/task/feature/t3": () => json({ id: "t3", featureId: "t1" }),
};

const writes = (requests: ReadonlyArray<readonly [string, string, unknown]>) =>
  requests.filter(([method]) => method === "PUT");

describe("runTaskEdit --release", () => {
  it("converts an empty Feature to Bug before adding it to another Feature", async () => {
    const source = resolvedTaskFixture(3, { type: "feature" });
    const run = await runCommand(
      runTaskEdit({
        ...none,
        task: "KAN-3",
        type: Option.some("bug"),
        feature: Option.some("KAN-1"),
      }),
      {
        ...routes,
        "GET /api/task/by-ticket-id/KAN-3": () => json(source.task),
        "GET /api/task/t3": () =>
          json({ ...source.task, type: "bug", featureId: "t1" }),
        "PUT /api/task/type/t3": () => json({ id: "t3", type: "bug" }),
      },
    );
    expect(Result.isSuccess(run.result)).toBe(true);
    expect(writes(run.requests)).toEqual([
      ["PUT", "/api/task/type/t3", { type: "bug" }],
      ["PUT", "/api/task/feature/t3", { featureId: "t1" }],
    ]);
    expect(run.json()).toMatchObject({ type: "bug", featureId: "t1" });
  });
  it("puts a feature into a release by name", async () => {
    const run = await runCommand(
      runTaskEdit({ ...none, task: "KAN-1", release: Option.some("2.4") }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(writes(run.requests)).toEqual([
      ["PUT", "/api/task/release/t1", { releaseId: "r1" }],
    ]);
    expect(run.json()).toMatchObject({ id: "t1", releaseId: "r1" });
  });

  it("sets the release after the feature, so it wins over the feature's", async () => {
    const run = await runCommand(
      runTaskEdit({
        ...none,
        task: "KAN-3",
        feature: Option.some("KAN-1"),
        release: Option.some("none"),
      }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(writes(run.requests)).toEqual([
      ["PUT", "/api/task/feature/t3", { featureId: "t1" }],
      ["PUT", "/api/task/release/t3", { releaseId: null }],
    ]);
  });

  it("changes nothing when the release is unknown", async () => {
    const run = await runCommand(
      runTaskEdit({ ...none, task: "KAN-1", release: Option.some("3.0") }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: '--release "3.0" does not match a release in Kaneo Web.',
    });
    expect(writes(run.requests)).toEqual([]);
  });
});
