import { describe, expect, it } from "vite-plus/test";
import {
  defaultGiteaConfig,
  type GiteaConfig,
} from "../../../../../apps/api/src/plugins/gitea/config";
import {
  extractTaskNumberFromBranchGitea,
  generateBranchName,
} from "../../../../../apps/api/src/plugins/gitea/utils/branch-matcher";

const config = {
  ...defaultGiteaConfig,
  baseUrl: "https://gitea.example",
  accessToken: "test-only",
  repositoryOwner: "acme",
  repositoryName: "web",
} as GiteaConfig;

describe("Gitea branch matching", () => {
  it("links the default feature and bugfix branches", () => {
    const pattern = config.branchPattern!;

    expect(
      extractTaskNumberFromBranchGitea(
        generateBranchName(pattern, "KAN", 2, "Tooltip", "task"),
        config,
        "KAN",
      ),
    ).toBe(2);
    expect(
      extractTaskNumberFromBranchGitea("bugfix/kan-7/login", config, "KAN"),
    ).toBe(7);
    expect(extractTaskNumberFromBranchGitea("kan-7", config, "KAN")).toBe(null);
  });
});
