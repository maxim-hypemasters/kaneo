import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runReleaseCreate } from "./create.js";

const { project } = resolvedTaskFixture(1);

const options = {
  name: Option.some(" 2.4 "),
  project: Option.none(),
  start: Option.some("2026-10-01"),
  codeFreeze: Option.some("2026-10-20"),
  submission: Option.some("2026-10-24"),
  description: Option.none(),
};

const routes = {
  "GET /api/project": () => json([project]),
  "POST /api/release/project/p1": () => {
    const { progress: _progress, ...created } = releaseFixture("r1", "2.4");
    return json(created);
  },
};

describe("runReleaseCreate", () => {
  it("creates a release with its three dates and prints it", async () => {
    const run = await runCommand(
      runReleaseCreate({ ...options, description: Option.some(" Payments ") }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.requests.at(-1)).toEqual([
      "POST",
      "/api/release/project/p1",
      {
        name: "2.4",
        startDate: "2026-10-01",
        codeFreezeDate: "2026-10-20",
        submissionDate: "2026-10-24",
        description: "Payments",
      },
    ]);
    expect(run.json()).toMatchObject({
      id: "r1",
      projectKey: "KAN",
      name: "2.4",
      progress: {
        tasks: { total: 0, completed: 0 },
        features: { total: 0, completed: 0 },
        unfinished: 0,
      },
      url: "https://kaneo.test/dashboard/workspace/ws_1/project/p1/releases/r1",
    });
  });

  it("refuses dates out of order without creating anything", async () => {
    const run = await runCommand(
      runReleaseCreate({ ...options, submission: Option.some("2026-10-19") }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      _tag: "InvalidArgument",
      message:
        "The submission date (2026-10-19) is before the code freeze (2026-10-20).",
    });
    expect(run.requests.some(([method]) => method === "POST")).toBe(false);
  });

  it("asks scripts for a missing date", async () => {
    const run = await runCommand(
      runReleaseCreate({ ...options, codeFreeze: Option.none() }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: "--code-freeze is required.",
      hint: "Pass the three dates, for example --start 2026-11-02 --code-freeze 2026-11-20 --submission 2026-11-27.",
    });
  });

  it("rejects a date it can't read before loading anything", async () => {
    const run = await runCommand(
      runReleaseCreate({ ...options, start: Option.some("2026-02-30") }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: '--start "2026-02-30" is not a date.',
    });
    expect(run.requests).toEqual([]);
  });
});
