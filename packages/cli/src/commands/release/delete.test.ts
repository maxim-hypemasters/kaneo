import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runReleaseDelete } from "./delete.js";

const { project } = resolvedTaskFixture(1);
const release = releaseFixture("r1", "2.4", {
  progress: {
    tasks: { total: 3, completed: 1 },
    features: { total: 1, completed: 0 },
    unfinished: 3,
  },
});

const routes = {
  "GET /api/project": () => json([project]),
  "GET /api/release/project/p1": () => json([release]),
  "DELETE /api/release/r1": () => json({ id: "r1" }),
};

describe("runReleaseDelete", () => {
  it("deletes the release and counts the items that stay", async () => {
    const run = await runCommand(
      runReleaseDelete({
        release: Option.some("2.4"),
        project: Option.none(),
        yes: true,
      }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.requests.at(-1)).toEqual([
      "DELETE",
      "/api/release/r1",
      undefined,
    ]);
    expect(run.json()).toEqual({
      id: "r1",
      projectId: "p1",
      name: "2.4",
      deleted: true,
      tasks: 3,
      features: 1,
    });
  });

  it("needs --yes in scripts", async () => {
    const run = await runCommand(
      runReleaseDelete({
        release: Option.some("2.4"),
        project: Option.none(),
        yes: false,
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message:
        "Deleting release 2.4 needs confirmation. Pass --yes to confirm.",
    });
    expect(run.requests.some(([method]) => method === "DELETE")).toBe(false);
  });

  it("asks scripts for the release", async () => {
    const run = await runCommand(
      runReleaseDelete({
        release: Option.none(),
        project: Option.none(),
        yes: true,
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: "A release is required.",
      hint: "Pass a release name or id, for example kaneo release delete 2.4.",
    });
  });
});
