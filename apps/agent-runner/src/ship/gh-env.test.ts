import { describe, expect, it } from "vite-plus/test";
import { testConfig } from "../test-support/fixtures";
import { ghEnv } from "./gh-env";

const env = { PATH: "/bin", HOME: "/root", GH_TOKEN: "ignored" };

describe("ghEnv", () => {
  it("passes only the runner's token to gh for github.com", () => {
    expect(ghEnv(testConfig("/tmp", {}), "ghp_x", env)).toEqual({
      PATH: "/bin",
      HOME: "/root",
      GH_TOKEN: "ghp_x",
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      NO_COLOR: "1",
    });
  });

  it("also passes it as the enterprise token for a GitHub Enterprise host", () => {
    const config = testConfig("/tmp", { githubHost: "github.corp.example" });
    expect(ghEnv(config, "ghp_x", env)).toMatchObject({
      GH_HOST: "github.corp.example",
      GH_TOKEN: "ghp_x",
      GH_ENTERPRISE_TOKEN: "ghp_x",
    });
  });
});
