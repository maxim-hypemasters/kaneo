import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runReleaseList } from "./list.js";

const { project } = resolvedTaskFixture(1);

describe("runReleaseList", () => {
  it("prints the project's releases in the server's order", async () => {
    const run = await runCommand(runReleaseList({ project: Option.none() }), {
      "GET /api/project": () => json([project]),
      "GET /api/release/project/p1": () =>
        json([
          releaseFixture("r1", "2.4", {
            startDate: "2000-01-01",
            codeFreezeDate: "2000-01-02",
            submissionDate: "2000-01-03",
          }),
          releaseFixture("r2", "9.0", {
            startDate: "9000-01-01",
            codeFreezeDate: "9000-01-02",
            submissionDate: "9000-01-03",
          }),
        ]),
    });

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.json()).toMatchObject([
      { id: "r1", name: "2.4", phase: "past-submission", projectKey: "KAN" },
      { id: "r2", name: "9.0", phase: "upcoming" },
    ]);
  });

  it("explains a server without releases", async () => {
    const run = await runCommand(runReleaseList({ project: Option.none() }), {
      "GET /api/project": () => json([project]),
    });

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      _tag: "InvalidArgument",
      message: "This Kaneo server has no releases yet.",
      hint: "Update the server, then try again.",
    });
  });
});
