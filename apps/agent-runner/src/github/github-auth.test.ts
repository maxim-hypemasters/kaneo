import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { loadGitHubAuth, resolvePrivateKey } from "./github-auth";

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs1", format: "pem" })
  .toString();

describe("loadGitHubAuth", () => {
  it("takes GH_TOKEN, or GITHUB_TOKEN", () => {
    expect(loadGitHubAuth({ GH_TOKEN: "ghp_a" })).toEqual({
      kind: "token",
      token: "ghp_a",
    });
    expect(loadGitHubAuth({ GITHUB_TOKEN: "ghp_b" })).toEqual({
      kind: "token",
      token: "ghp_b",
    });
  });

  it("takes a GitHub App with its key in any form Kaneo reads", () => {
    const base64 = Buffer.from(pem).toString("base64");
    const oneLine = pem.trim().replace(/\n/g, "\\n");
    for (const env of [
      { GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY_BASE64: base64 },
      { GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY: pem },
      { GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY: oneLine },
    ])
      expect(loadGitHubAuth(env)).toEqual({
        kind: "app",
        appId: "123",
        privateKey: pem.trim(),
      });
  });

  it("keeps an app to the installation GITHUB_APP_INSTALLATION_ID names", () => {
    const app = { GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY: pem };
    expect(
      loadGitHubAuth({ ...app, GITHUB_APP_INSTALLATION_ID: "42" }),
    ).toMatchObject({ kind: "app", installationId: 42 });
    expect(loadGitHubAuth(app)).not.toHaveProperty("installationId");
    expect(() =>
      loadGitHubAuth({ ...app, GITHUB_APP_INSTALLATION_ID: "org-a" }),
    ).toThrow(/must be a number/);
  });

  it("is null with neither, counting empty values as unset", () => {
    expect(loadGitHubAuth({})).toBeNull();
    expect(
      loadGitHubAuth({
        GH_TOKEN: " ",
        GITHUB_APP_ID: "",
        GITHUB_PRIVATE_KEY: "",
      }),
    ).toBeNull();
  });

  it("refuses a token and an app together, half an app, or a broken key", () => {
    expect(() =>
      loadGitHubAuth({ GH_TOKEN: "ghp_a", GITHUB_APP_ID: "123" }),
    ).toThrow(/not both/);
    expect(() => loadGitHubAuth({ GITHUB_APP_ID: "123" })).toThrow(
      /go together/,
    );
    expect(() => loadGitHubAuth({ GITHUB_PRIVATE_KEY: pem })).toThrow(
      /go together/,
    );
    expect(() =>
      loadGitHubAuth({ GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY: "not a key" }),
    ).toThrow(/not a valid PEM key/);
  });
});

describe("resolvePrivateKey", () => {
  it("prefers the base64 form", () => {
    const base64 = Buffer.from("from base64").toString("base64");
    expect(
      resolvePrivateKey({
        GITHUB_PRIVATE_KEY_BASE64: base64,
        GITHUB_PRIVATE_KEY: "plain",
      }),
    ).toBe("from base64");
  });
});
