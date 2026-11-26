import { describe, expect, it } from "vite-plus/test";
import { agentBranchName } from "./branch-name";

const task = { projectSlug: "HUB", taskNumber: 42, taskTitle: "Fix login!" };

describe("agentBranchName", () => {
  it("uses the project's GitHub branch pattern", () => {
    expect(agentBranchName({ ...task, pattern: "fix/{number}-{title}" })).toBe(
      "fix/42-fix-login",
    );
  });

  it("falls back to {slug}-{number} for no or a custom pattern", () => {
    expect(agentBranchName({ ...task, pattern: undefined })).toBe("hub-42");
    expect(agentBranchName({ ...task, pattern: "custom" })).toBe("hub-42");
  });
});
