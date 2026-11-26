import { describe, expect, it } from "vite-plus/test";
import { buildHermesConfig } from "./hermes-config";
import { hermesEnv } from "./child-env";

describe("hermesEnv", () => {
  it("withholds the runner's credentials and empty values, and keeps provider keys", () => {
    const env = hermesEnv(
      {
        PATH: "/bin",
        GH_TOKEN: "ghp_x",
        GITHUB_TOKEN: "ghp_y",
        KANEO_RUNNER_TOKEN: "kar_z",
        GITHUB_APP_ID: "123",
        GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
        GITHUB_PRIVATE_KEY_BASE64: "LS0tLS1CRUdJTg==",
        OPENROUTER_API_KEY: "sk-or",
        ANTHROPIC_API_KEY: "",
      },
      { HERMES_HOME: "/data/h" },
    );
    expect(env).toEqual({
      PATH: "/bin",
      OPENROUTER_API_KEY: "sk-or",
      GIT_TERMINAL_PROMPT: "0",
      HERMES_HOME: "/data/h",
    });
  });
});

describe("buildHermesConfig", () => {
  it("denies pushing and gh even under yolo", () => {
    const config = buildHermesConfig();
    expect(config).toContain('"*git push*"');
    expect(config).toContain('"gh *"');
  });

  it("keeps Hermes in English, whose wording marks an abnormal ending", () => {
    expect(buildHermesConfig()).toContain("display:\n  language: en\n");
  });
});
