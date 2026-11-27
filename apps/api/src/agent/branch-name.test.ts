import { describe, expect, it } from "vite-plus/test";
import { agentBranchName } from "./branch-name";

const task = {
  projectSlug: "HUB",
  taskNumber: 42,
  taskTitle: "Fix login!",
  taskType: "bug",
  workBranch: null,
};

describe("agentBranchName", () => {
  it("uses the project's GitHub branch pattern", () => {
    expect(agentBranchName({ ...task, pattern: "fix/{number}-{title}" })).toBe(
      "fix/42-fix-login",
    );
  });

  it("names a bug bugfix/ and a task feature/", () => {
    expect(agentBranchName({ ...task, pattern: undefined })).toBe(
      "bugfix/hub-42/fix-login",
    );
    expect(
      agentBranchName({ ...task, taskType: "task", pattern: undefined }),
    ).toBe("feature/hub-42/fix-login");
  });

  it("falls back to the typed pattern for a custom pattern", () => {
    expect(agentBranchName({ ...task, pattern: "custom" })).toBe(
      "bugfix/hub-42/fix-login",
    );
  });

  it("keeps the branch a Start pushed after the title changes", () => {
    expect(
      agentBranchName({
        ...task,
        pattern: undefined,
        taskTitle: "Fix login on Firefox",
        workBranch: "bugfix/hub-42/fix-login",
      }),
    ).toBe("bugfix/hub-42/fix-login");
  });

  it("renames a branch the current pattern doesn't give this task", () => {
    const named = (workBranch: string) =>
      agentBranchName({ ...task, pattern: undefined, workBranch });

    expect(named("hub-42")).toBe("bugfix/hub-42/fix-login");
    expect(named("bugfix/hub-41/fix-login")).toBe("bugfix/hub-42/fix-login");
    expect(named("bugfix/ops-42/fix-login")).toBe("bugfix/hub-42/fix-login");
  });

  it("keeps a pushed branch for a project key with RegExp characters", () => {
    expect(
      agentBranchName({
        ...task,
        pattern: undefined,
        projectSlug: "C++",
        taskTitle: "Fix login on Firefox",
        workBranch: "bugfix/c++-42/fix-login",
      }),
    ).toBe("bugfix/c++-42/fix-login");
    expect(
      agentBranchName({
        ...task,
        pattern: undefined,
        projectSlug: "$&X",
        workBranch: null,
      }),
    ).toBe("bugfix/$&x-42/fix-login");
  });

  it("keeps an old-format branch while the project keeps its pattern", () => {
    expect(
      agentBranchName({
        ...task,
        pattern: "{slug}-{number}",
        workBranch: "hub-42",
      }),
    ).toBe("hub-42");
  });
});
