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
});
