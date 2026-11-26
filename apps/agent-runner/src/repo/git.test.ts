import { describe, expect, it } from "vite-plus/test";
import { tempDir, testConfig } from "../test-support/fixtures";
import { git, gitEnv } from "./git";

describe("gitEnv", () => {
  it("gives git the token only when there is one", () => {
    const config = testConfig("/tmp", {});
    expect(gitEnv(config, "ghs_x").KANEO_GIT_TOKEN).toBe("ghs_x");
    expect(gitEnv(config, null)).not.toHaveProperty("KANEO_GIT_TOKEN");
  });
});

describe("git", () => {
  it("answers credentials for the GitHub host only with a token", async () => {
    const cwd = await tempDir();
    const config = testConfig(cwd, {});
    await git(config, ["init", "--quiet"], { cwd });
    const helper = ["config", "--get", "credential.https://github.com.helper"];
    expect(await git(config, helper, { cwd, token: "ghs_x" })).toContain(
      "$KANEO_GIT_TOKEN",
    );
    await expect(git(config, helper, { cwd })).rejects.toThrow();
  });
});
