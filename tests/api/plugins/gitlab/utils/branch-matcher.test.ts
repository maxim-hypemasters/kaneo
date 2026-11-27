import { describe, expect, it } from "vite-plus/test";
import {
  defaultGitlabConfig,
  type GitlabConfig,
} from "../../../../../apps/api/src/plugins/gitlab/config";
import {
  extractTaskNumberFromBranchGitlab,
  generateBranchName,
} from "../../../../../apps/api/src/plugins/gitlab/utils/branch-matcher";

const config = {
  ...defaultGitlabConfig,
  baseUrl: "https://gitlab.example",
  accessToken: "test-only",
  projectPath: "acme/web",
} as GitlabConfig;

describe("GitLab branch matching", () => {
  it("links the default feature and bugfix branches", () => {
    const pattern = config.branchPattern!;

    expect(
      extractTaskNumberFromBranchGitlab(
        generateBranchName(pattern, "KAN", 2, "Tooltip", "task"),
        config,
        "KAN",
      ),
    ).toBe(2);
    expect(
      extractTaskNumberFromBranchGitlab("bugfix/kan-7/login", config, "KAN"),
    ).toBe(7);
    expect(extractTaskNumberFromBranchGitlab("kan-7", config, "KAN")).toBe(
      null,
    );
  });
});
