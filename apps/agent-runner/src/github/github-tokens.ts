import { createSign } from "node:crypto";
import { RUNNER_VERSION } from "../version";
import type { GitHubAuth } from "./github-auth";

export type GitHubAccess = "read" | "write";

/** A token for one repository, or null when the runner has no credentials. */
export type GitHubTokens = (
  repository: string,
  access: GitHubAccess,
  signal?: AbortSignal,
) => Promise<string | null>;

/** A GitHub App can't give the runner a token for a repository. */
export class GitHubAuthError extends Error {}

type Deps = { fetch: typeof fetch; now: () => number };

// An app token lasts an hour; one with less left than this is replaced, so
// a push late in a long run never carries an expired token.
const MIN_LIFETIME_MS = 15 * 60_000;

const PERMISSIONS: Record<GitHubAccess, Record<string, string>> = {
  read: { contents: "read", metadata: "read" },
  write: { contents: "write", pull_requests: "write", metadata: "read" },
};

/** The REST API of github.com, or of a GitHub Enterprise Server host. */
export function githubApiBase(host: string) {
  return host === "github.com"
    ? "https://api.github.com"
    : `https://${host}/api/v3`;
}

/** A GitHub App JWT, valid for nine minutes, back-dated for clock skew. */
export function appJwt(appId: string, privateKey: string, nowMs: number) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(nowMs / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

/**
 * The runner's GitHub tokens. With a GitHub App, each repository gets an
 * installation token of its own, limited to that repository and to the
 * access asked for, and reused until it nears its expiry. With an
 * installation pinned, repositories of the app's other installations are
 * refused: the repository comes from a project's settings.
 */
export function createGitHubTokens(
  auth: GitHubAuth | null,
  host: string,
  deps: Deps = { fetch: globalThis.fetch, now: Date.now },
): GitHubTokens {
  if (!auth) return async () => null;
  if (auth.kind === "token") return async () => auth.token;

  const base = githubApiBase(host);
  const installations = new Map<string, number>();
  const tokens = new Map<string, { token: string; expiresAt: number }>();

  const call = async (
    method: "GET" | "POST",
    path: string,
    body: object | undefined,
    signal: AbortSignal | undefined,
  ) => {
    let response: Response;
    try {
      response = await deps.fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${appJwt(auth.appId, auth.privateKey, deps.now())}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": `kaneo-agent-runner/${RUNNER_VERSION}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      });
    } catch (error) {
      // A stop is the run's, not GitHub's.
      if (signal?.aborted) throw error;
      const cause = (error as { cause?: { code?: string; message?: string } })
        .cause;
      throw new GitHubAuthError(
        `Can't reach the GitHub API at ${base}: ${cause?.code ?? cause?.message ?? (error as Error).message}`,
      );
    }
    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const message = String(json.message ?? "").replace(/\.$/, "");
    return { status: response.status, ok: response.ok, json, message };
  };

  const installationFor = async (repository: string, signal?: AbortSignal) => {
    const known = installations.get(repository);
    if (known) return known;
    const [owner = "", name = ""] = repository.split("/");
    const found = await call(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/installation`,
      undefined,
      signal,
    );
    if (found.status === 404)
      throw new GitHubAuthError(
        `The GitHub App isn't installed on ${repository}, or can't access it`,
      );
    if (!found.ok || typeof found.json.id !== "number")
      throw new GitHubAuthError(
        `GitHub didn't find the app's installation for ${repository}: ${found.message || `status ${found.status}`}`,
      );
    if (auth.installationId && found.json.id !== auth.installationId)
      throw new GitHubAuthError(
        `${repository} belongs to another installation of the GitHub App than GITHUB_APP_INSTALLATION_ID`,
      );
    installations.set(repository, found.json.id);
    return found.json.id;
  };

  return async (repository, access, signal) => {
    const key = `${repository} ${access}`;
    const cached = tokens.get(key);
    if (cached && cached.expiresAt - deps.now() > MIN_LIFETIME_MS)
      return cached.token;

    const [, name] = repository.split("/");
    const request = async () =>
      call(
        "POST",
        `/app/installations/${await installationFor(repository, signal)}/access_tokens`,
        { repositories: [name], permissions: PERMISSIONS[access] },
        signal,
      );
    const wasKnown = installations.has(repository);
    let created = await request();
    if (created.status === 404 && wasKnown) {
      // A reinstalled app has a new installation; look it up again, once.
      installations.delete(repository);
      created = await request();
    }
    if (!created.ok || typeof created.json.token !== "string") {
      installations.delete(repository);
      const missingPermissions =
        created.status === 422 && /permission/i.test(created.message);
      throw new GitHubAuthError(
        `The GitHub App can't get ${access} access to ${repository}: ${created.message || `status ${created.status}`}.${
          missingPermissions
            ? ` It needs Contents${access === "write" ? " and Pull requests" : ""} ${access} access on that repository.`
            : ""
        }`,
      );
    }
    const expiresAt = Date.parse(String(created.json.expires_at));
    tokens.set(key, {
      token: created.json.token,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : deps.now(),
    });
    return created.json.token;
  };
}
