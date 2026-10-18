import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json, type RecordedRequest } from "../../testing/test-layers.js";
import { runTaskCreate } from "./create.js";

const { project } = resolvedTaskFixture(1);

const options = {
  title: Option.some("Write the welcome email"),
  project: Option.none(),
  description: Option.none(),
  priority: "no-priority" as const,
  status: Option.none(),
  assignee: Option.none(),
  due: Option.none(),
  start: Option.none(),
  label: [],
  type: "task" as const,
  feature: Option.none(),
  release: Option.none(),
};

const routes = {
  "GET /api/project": () => json([project]),
  "GET /api/release/project/p1": () => json([releaseFixture("r1", "2.4")]),
  "GET /api/column/p1": () => json([]),
  "POST /api/task/p1": (request: RecordedRequest) => {
    const body = request.body as { releaseId?: string | null };
    return json({
      id: "t7",
      projectId: "p1",
      number: 7,
      title: "Write the welcome email",
      description: "",
      status: "to-do",
      priority: "no-priority",
      startDate: null,
      dueDate: null,
      createdAt: "2026-10-08T10:00:00.000Z",
      userId: null,
      type: "task",
      featureId: null,
      releaseId: body.releaseId ?? null,
    });
  },
};

const createBody = (
  requests: ReadonlyArray<readonly [string, string, unknown]>,
) => requests.find(([method]) => method === "POST")?.[2];

describe("runTaskCreate --release", () => {
  it("creates the task in the release named by --release", async () => {
    const run = await runCommand(
      runTaskCreate({ ...options, release: Option.some("2.4") }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(createBody(run.requests)).toMatchObject({ releaseId: "r1" });
    expect(run.json()).toMatchObject({ id: "t7", releaseId: "r1" });
  });

  it("sends null for none, so a feature's release isn't followed", async () => {
    const run = await runCommand(
      runTaskCreate({ ...options, release: Option.some("None") }),
      routes,
    );

    expect(createBody(run.requests)).toMatchObject({ releaseId: null });
  });

  it("leaves the release to the server without --release", async () => {
    const run = await runCommand(runTaskCreate(options), routes);

    expect(createBody(run.requests)).not.toHaveProperty("releaseId");
    expect(run.requests.some(([, path]) => path.includes("/release/"))).toBe(
      false,
    );
    expect(run.json()).toMatchObject({ releaseId: null });
  });

  it("refuses an unknown release before creating the task", async () => {
    const run = await runCommand(
      runTaskCreate({ ...options, release: Option.some("3.0") }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: '--release "3.0" does not match a release in Kaneo Web.',
    });
    expect(createBody(run.requests)).toBeUndefined();
  });
});
