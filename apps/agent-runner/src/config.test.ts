import { describe, expect, it } from "vite-plus/test";
import { loadConfig, normalizeApiUrl } from "./config";

const env = { KANEO_API_URL: "http://kaneo:5173", KANEO_RUNNER_TOKEN: "kar_x" };

describe("loadConfig", () => {
  it("requires the API URL and runner token", () => {
    expect(() => loadConfig({})).toThrow("KANEO_API_URL is required");
    expect(() => loadConfig({ KANEO_API_URL: "http://x" })).toThrow(
      "KANEO_RUNNER_TOKEN is required",
    );
  });

  it("applies defaults", () => {
    expect(loadConfig(env)).toMatchObject({
      apiUrl: "http://kaneo:5173/api",
      github: null,
      assessConcurrency: 2,
      shipConcurrency: 1,
      hermesModel: "anthropic/claude-sonnet-5.5",
    });
  });

  it("reads the GitHub token from either variable", () => {
    expect(loadConfig({ ...env, GITHUB_TOKEN: "ghp_a" }).github).toEqual({
      kind: "token",
      token: "ghp_a",
    });
    expect(
      loadConfig({ ...env, GH_TOKEN: "ghp_b", GITHUB_TOKEN: "ghp_a" }).github,
    ).toEqual({ kind: "token", token: "ghp_b" });
  });

  it("treats empty values, as Compose passes unset ones, as defaults", () => {
    const config = loadConfig({
      ...env,
      GH_TOKEN: "",
      GITHUB_APP_ID: "",
      GITHUB_PRIVATE_KEY_BASE64: "",
      HERMES_PROVIDER: "",
      HERMES_MODEL: "",
      GITHUB_HOST: "",
      SHIP_CONCURRENCY: "",
      SHIP_TIMEOUT_MS: "",
      SHIP_TOOLSETS: "",
      GIT_AUTHOR_NAME: "",
    });
    expect(config).toMatchObject({
      github: null,
      hermesProvider: "openrouter",
      hermesModel: "anthropic/claude-sonnet-5.5",
      githubHost: "github.com",
      gitRemoteBase: "https://github.com",
      shipConcurrency: 1,
      shipTimeoutMs: 60 * 60_000,
      shipToolsets: ["file", "terminal", "todo"],
      gitAuthorName: "Hermes Agent",
    });
  });

  it("reads the HERMES_UID user, which takes a root runner", () => {
    const ids = { ...env, HERMES_UID: "10000", HERMES_GID: "10001" };
    expect(loadConfig(ids, 0).hermesUser).toEqual({ uid: 10000, gid: 10001 });
    expect(loadConfig({ ...env, HERMES_UID: "10000" }, 0).hermesUser).toEqual({
      uid: 10000,
      gid: 10000,
    });
    expect(() => loadConfig(ids, 10000)).toThrow("not root");
    expect(loadConfig(env, 1000).hermesUser).toBeNull();
    expect(loadConfig(env, 0).hermesUser).toBeNull();
    expect(() => loadConfig({ ...env, HERMES_UID: "0" }, 0)).toThrow(
      "HERMES_UID",
    );
  });

  it("rejects bad numbers", () => {
    expect(() => loadConfig({ ...env, SHIP_CONCURRENCY: "-1" })).toThrow(
      "SHIP_CONCURRENCY",
    );
  });
});

describe("normalizeApiUrl", () => {
  it("appends /api once", () => {
    expect(normalizeApiUrl("https://k.example.com/")).toBe(
      "https://k.example.com/api",
    );
    expect(normalizeApiUrl("https://k.example.com/api/")).toBe(
      "https://k.example.com/api",
    );
  });
});
