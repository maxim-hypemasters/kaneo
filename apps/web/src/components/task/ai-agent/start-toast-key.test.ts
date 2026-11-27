import { describe, expect, it } from "vite-plus/test";
import { startToastKey } from "./start-toast-key";

describe("startToastKey", () => {
  it("says a draft pull request is on its way", () => {
    expect(startToastKey({ pullRequest: "queued" })).toBe(
      "tasks:aiAgent.toast.startedWithPullRequest",
    );
  });

  it("says why no draft pull request opens", () => {
    expect(startToastKey({ pullRequest: "runner_missing" })).toBe(
      "tasks:aiAgent.toast.startedNoRunner",
    );
    expect(startToastKey({ pullRequest: "runner_cannot_push" })).toBe(
      "tasks:aiAgent.toast.startedNoPush",
    );
  });

  it("only reports the start when the project has no repository", () => {
    expect(startToastKey({ pullRequest: "no_repository" })).toBe(
      "tasks:aiAgent.toast.started",
    );
    expect(startToastKey({ pullRequest: "not_requested" })).toBe(
      "tasks:aiAgent.toast.started",
    );
  });
});
