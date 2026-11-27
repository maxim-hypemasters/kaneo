import { describe, expect, it } from "vite-plus/test";
import {
  computeStartBlockers,
  startPullRequestState,
} from "./compute-start-blockers";

const free = { archived: false, inTriage: false, runInProgress: false };

describe("computeStartBlockers", () => {
  it("allows a task at any readiness", () => {
    expect(computeStartBlockers(free)).toEqual([]);
  });

  it("names every reason in a stable order", () => {
    expect(
      computeStartBlockers({
        archived: true,
        inTriage: true,
        runInProgress: true,
      }),
    ).toEqual(["archived", "in_triage", "run_in_progress"]);
    expect(computeStartBlockers({ ...free, inTriage: true })).toEqual([
      "in_triage",
    ]);
  });
});

describe("startPullRequestState", () => {
  const runner = { canPush: true };

  it("opens a draft with a repository and a runner that can push", () => {
    expect(startPullRequestState({ repository: "acme/app", runner })).toBe(
      "opens",
    );
  });

  it("only moves the task otherwise, saying why", () => {
    expect(startPullRequestState({ repository: null, runner })).toBe(
      "no_repository",
    );
    expect(
      startPullRequestState({ repository: "acme/app", runner: null }),
    ).toBe("runner_missing");
    expect(
      startPullRequestState({
        repository: "acme/app",
        runner: { canPush: false },
      }),
    ).toBe("runner_cannot_push");
  });
});
