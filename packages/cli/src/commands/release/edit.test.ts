import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { releaseFixture } from "../../releases/test-releases.js";
import { resolvedTaskFixture } from "../../testing/resolved-task.js";
import { runCommand } from "../../testing/run-command.js";
import { json } from "../../testing/test-layers.js";
import { runReleaseEdit } from "./edit.js";

const { project } = resolvedTaskFixture(1);
const progress = {
  tasks: { total: 12, completed: 4 },
  features: { total: 2, completed: 0 },
  unfinished: 10,
};
const releases = [
  releaseFixture("r1", "2.4", { description: "Payments", progress }),
  releaseFixture("r2", "2.5", { startDate: "2026-10-25" }),
];

const none = {
  project: Option.none(),
  name: Option.none(),
  start: Option.none(),
  codeFreeze: Option.none(),
  submission: Option.none(),
  description: Option.none(),
};

const routes = {
  "GET /api/project": () => json([project]),
  "GET /api/release/project/p1": () => json(releases),
  "PUT /api/release/r1": (request: { body: unknown }) => {
    const { progress: _progress, ...release } = releaseFixture("r1", "2.4");
    return json({ ...release, ...(request.body as object) });
  },
};

describe("runReleaseEdit", () => {
  it("sends only the changed fields, and clears the description with an empty one", async () => {
    const run = await runCommand(
      runReleaseEdit({
        ...none,
        release: Option.some("2.4"),
        submission: Option.some("2026-10-31"),
        description: Option.some(""),
      }),
      routes,
    );

    expect(Result.isSuccess(run.result)).toBe(true);
    expect(run.requests.at(-1)).toEqual([
      "PUT",
      "/api/release/r1",
      { submissionDate: "2026-10-31", description: null },
    ]);
    expect(run.json()).toMatchObject({
      submissionDate: "2026-10-31",
      description: null,
      progress,
    });
  });

  it("checks the date order against the stored dates", async () => {
    const run = await runCommand(
      runReleaseEdit({
        ...none,
        release: Option.some("2.4"),
        codeFreeze: Option.some("2026-09-30"),
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message:
        "The code freeze (2026-09-30) is before the start date (2026-10-01).",
    });
    expect(run.requests.some(([method]) => method === "PUT")).toBe(false);
  });

  it("says release dates can't be cleared with none", async () => {
    const run = await runCommand(
      runReleaseEdit({
        ...none,
        release: Option.some("2.4"),
        codeFreeze: Option.some("none"),
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: "--code-freeze needs a date: release dates can't be cleared.",
    });
    expect(run.requests).toEqual([]);
  });

  it("refuses a name another release has", async () => {
    const run = await runCommand(
      runReleaseEdit({
        ...none,
        release: Option.some("r1"),
        name: Option.some("2.5"),
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: 'A release named "2.5" already exists in Kaneo Web.',
    });
    expect(run.requests.some(([method]) => method === "PUT")).toBe(false);
  });

  it("says nothing changes without a flag", async () => {
    const run = await runCommand(
      runReleaseEdit({ ...none, release: Option.some("2.4") }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: "Nothing to change.",
    });
    expect(run.requests).toEqual([]);
  });

  it("names an unknown release", async () => {
    const run = await runCommand(
      runReleaseEdit({
        ...none,
        release: Option.some("3.0"),
        name: Option.some("3.1"),
      }),
      routes,
    );

    expect(Result.isFailure(run.result) && run.result.failure).toMatchObject({
      message: '"3.0" does not match a release in Kaneo Web.',
      hint: "Run kaneo release list to see the project's releases.",
    });
  });
});
