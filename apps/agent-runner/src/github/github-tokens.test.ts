import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  appJwt,
  createGitHubTokens,
  GitHubAuthError,
  githubApiBase,
} from "./github-tokens";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const app = { kind: "app" as const, appId: "123", privateKey: pem };
const HOUR = 60 * 60_000;

type Call = { method: string; url: string; body: unknown; auth: string };

// A fake GitHub API: answers by path, and records what was asked.
function fakeGitHub(
  now: { value: number },
  answers: Record<string, { status: number; json: object }> = {},
) {
  const calls: Call[] = [];
  let issued = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init.headers).get("authorization") ?? "",
    });
    const answer =
      answers[path] ??
      (path.endsWith("/installation")
        ? { status: 200, json: { id: 42 } }
        : {
            status: 201,
            json: {
              token: `ghs_token${++issued}`,
              expires_at: new Date(now.value + HOUR).toISOString(),
            },
          });
    return new Response(JSON.stringify(answer.json), {
      status: answer.status,
    });
  }) as typeof globalThis.fetch;
  return { calls, fetch: fakeFetch };
}

describe("appJwt", () => {
  it("signs a short-lived JWT for the app with its key", () => {
    const now = Date.UTC(2026, 10, 26, 12);
    const [header = "", payload = "", signature = ""] = appJwt(
      "123",
      pem,
      now,
    ).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iat: now / 1000 - 60,
      exp: now / 1000 + 540,
      iss: "123",
    });
    const verify = createVerify("RSA-SHA256").update(`${header}.${payload}`);
    expect(verify.verify(publicKey, signature, "base64url")).toBe(true);
  });
});

describe("createGitHubTokens", () => {
  it("has no token without credentials, and the one token it was given", async () => {
    expect(await createGitHubTokens(null, "github.com")("a/b", "write")).toBe(
      null,
    );
    const fixed = createGitHubTokens(
      { kind: "token", token: "ghp_x" },
      "github.com",
    );
    expect(await fixed("a/b", "read")).toBe("ghp_x");
  });

  it("gets an app token limited to the repository and the access asked for", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now);
    const tokens = createGitHubTokens(app, "github.com", {
      fetch: github.fetch,
      now: () => now.value,
    });

    expect(await tokens("acme/app", "read")).toBe("ghs_token1");
    expect(await tokens("acme/app", "write")).toBe("ghs_token2");

    expect(github.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api.github.com/repos/acme/app/installation",
      "POST https://api.github.com/app/installations/42/access_tokens",
      "POST https://api.github.com/app/installations/42/access_tokens",
    ]);
    expect(github.calls[1]?.body).toEqual({
      repositories: ["app"],
      permissions: { contents: "read", metadata: "read" },
    });
    expect(github.calls[2]?.body).toEqual({
      repositories: ["app"],
      permissions: {
        contents: "write",
        pull_requests: "write",
        metadata: "read",
      },
    });
    expect(github.calls[0]?.auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("reuses a token until it nears its expiry", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now);
    const tokens = createGitHubTokens(app, "github.com", {
      fetch: github.fetch,
      now: () => now.value,
    });

    expect(await tokens("acme/app", "write")).toBe("ghs_token1");
    now.value += 40 * 60_000;
    expect(await tokens("acme/app", "write")).toBe("ghs_token1");
    now.value += 10 * 60_000;
    expect(await tokens("acme/app", "write")).toBe("ghs_token2");
    // The installation is looked up once.
    expect(github.calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("says when the app isn't installed on the repository", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now, {
      "/repos/acme/app/installation": {
        status: 404,
        json: { message: "Not Found" },
      },
    });
    const tokens = createGitHubTokens(app, "github.com", {
      fetch: github.fetch,
      now: () => now.value,
    });
    const failure = tokens("acme/app", "write");
    await expect(failure).rejects.toBeInstanceOf(GitHubAuthError);
    await expect(failure).rejects.toThrow(
      "The GitHub App isn't installed on acme/app",
    );
  });

  it("says which access the app lacks", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now, {
      "/app/installations/42/access_tokens": {
        status: 422,
        json: {
          message:
            "The permissions requested are not granted to this installation.",
        },
      },
    });
    const tokens = createGitHubTokens(app, "github.com", {
      fetch: github.fetch,
      now: () => now.value,
    });
    await expect(tokens("acme/app", "write")).rejects.toThrow(
      "The GitHub App can't get write access to acme/app: The permissions requested are not granted to this installation. It needs Contents and Pull requests write access on that repository.",
    );
  });

  it("refuses a repository of another installation than the pinned one", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now);
    const tokens = createGitHubTokens(
      { ...app, installationId: 7 },
      "github.com",
      { fetch: github.fetch, now: () => now.value },
    );
    await expect(tokens("other-org/app", "read")).rejects.toThrow(
      "other-org/app belongs to another installation of the GitHub App than GITHUB_APP_INSTALLATION_ID",
    );
    // No token was asked for.
    expect(github.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("looks the installation up again once when the app was reinstalled", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    let installation = 42;
    const asked: string[] = [];
    const fetch = (async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);
      if (path.endsWith("/installation"))
        return Response.json({ id: installation });
      if (path !== `/app/installations/${installation}/access_tokens`)
        return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(
        {
          token: `ghs_from${installation}`,
          expires_at: new Date(now.value + HOUR).toISOString(),
        },
        { status: 201 },
      );
    }) as typeof globalThis.fetch;
    const tokens = createGitHubTokens(app, "github.com", {
      fetch,
      now: () => now.value,
    });

    expect(await tokens("acme/app", "write")).toBe("ghs_from42");
    installation = 43;
    now.value += 50 * 60_000;
    expect(await tokens("acme/app", "write")).toBe("ghs_from43");
    expect(asked).toEqual([
      "/repos/acme/app/installation",
      "/app/installations/42/access_tokens",
      "/app/installations/42/access_tokens",
      "/repos/acme/app/installation",
      "/app/installations/43/access_tokens",
    ]);
  });

  it("gives GitHub's reason, and a permissions hint only for missing permissions", async () => {
    const now = { value: Date.UTC(2026, 10, 26, 12) };
    const github = fakeGitHub(now, {
      "/app/installations/42/access_tokens": {
        status: 403,
        json: { message: "This installation has been suspended" },
      },
    });
    const tokens = createGitHubTokens(app, "github.com", {
      fetch: github.fetch,
      now: () => now.value,
    });
    await expect(tokens("acme/app", "read")).rejects.toThrow(
      /^The GitHub App can't get read access to acme\/app: This installation has been suspended\.$/,
    );
  });

  it("says when it can't reach GitHub, and lets a stop through as it is", async () => {
    const unreachable = (async () => {
      throw new TypeError("fetch failed", {
        cause: { code: "ECONNREFUSED" },
      });
    }) as unknown as typeof globalThis.fetch;
    const tokens = createGitHubTokens(app, "github.corp.example", {
      fetch: unreachable,
      now: Date.now,
    });
    await expect(tokens("acme/app", "write")).rejects.toThrow(
      "Can't reach the GitHub API at https://github.corp.example/api/v3: ECONNREFUSED",
    );

    const stop = new AbortController();
    stop.abort();
    await expect(
      tokens("acme/app", "write", stop.signal),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("uses a GitHub Enterprise Server host's API", () => {
    expect(githubApiBase("github.com")).toBe("https://api.github.com");
    expect(githubApiBase("github.corp.example")).toBe(
      "https://github.corp.example/api/v3",
    );
  });
});
