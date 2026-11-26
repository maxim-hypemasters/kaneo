import { describe, expect, it } from "vite-plus/test";
import { resolveRunnerApiUrl, runnerEnvSnippet } from "./runner-env";

describe("resolveRunnerApiUrl", () => {
  it("keeps a separately hosted API's URL and adds /api", () => {
    expect(
      resolveRunnerApiUrl(
        "https://api.example.com/",
        "https://app.example.com",
      ),
    ).toBe("https://api.example.com/api");
    expect(
      resolveRunnerApiUrl("https://example.com/api", "https://example.com"),
    ).toBe("https://example.com/api");
  });

  it("resolves a same-origin API against the page", () => {
    expect(resolveRunnerApiUrl("/api", "https://kaneo.example.com")).toBe(
      "https://kaneo.example.com/api",
    );
  });

  it("falls back to the local API like the web client", () => {
    expect(resolveRunnerApiUrl(undefined, "http://localhost:5173")).toBe(
      "http://localhost:1337/api",
    );
  });
});

describe("runnerEnvSnippet", () => {
  it("lists the API URL and token", () => {
    expect(runnerEnvSnippet("https://k.example/api", "kr_abc")).toBe(
      "KANEO_API_URL=https://k.example/api\nKANEO_RUNNER_TOKEN=kr_abc",
    );
  });
});
