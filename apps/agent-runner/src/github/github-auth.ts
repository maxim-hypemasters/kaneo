import { createPrivateKey } from "node:crypto";

/**
 * How the runner reaches GitHub: one token for everything, or a GitHub App
 * it gets a token from per repository.
 */
export type GitHubAuth =
  | { kind: "token"; token: string }
  | {
      kind: "app";
      appId: string;
      privateKey: string;
      // Repositories of the app's other installations are refused.
      installationId?: number;
    };

type Env = Record<string, string | undefined>;

/**
 * The app's private key as Kaneo's GitHub integration reads it: base64 of
 * the PEM, or the PEM itself, which hosts that strip newlines may pass with
 * literal "\n" separators.
 */
export function resolvePrivateKey(env: Env): string {
  const base64 = env.GITHUB_PRIVATE_KEY_BASE64?.trim();
  if (base64) return Buffer.from(base64, "base64").toString("utf8").trim();
  const raw = env.GITHUB_PRIVATE_KEY?.trim() ?? "";
  return raw.includes("\\n") && !raw.includes("\n")
    ? raw.replace(/\\n/g, "\n")
    : raw;
}

/** GH_TOKEN or a GitHub App from the environment; null with neither. */
export function loadGitHubAuth(env: Env): GitHubAuth | null {
  const token = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = resolvePrivateKey(env);
  if (token && (appId || privateKey))
    throw new Error(
      "Set GH_TOKEN or a GitHub App (GITHUB_APP_ID with GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_BASE64), not both",
    );
  if (token) return { kind: "token", token };
  if (!appId && !privateKey) return null;
  if (!appId || !privateKey)
    throw new Error(
      "GITHUB_APP_ID and GITHUB_PRIVATE_KEY (or GITHUB_PRIVATE_KEY_BASE64) go together",
    );
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error("The GitHub App's private key is not a valid PEM key");
  }
  const pinned = env.GITHUB_APP_INSTALLATION_ID?.trim();
  if (pinned && !/^\d+$/.test(pinned))
    throw new Error("GITHUB_APP_INSTALLATION_ID must be a number");
  return {
    kind: "app",
    appId,
    privateKey,
    ...(pinned ? { installationId: Number(pinned) } : {}),
  };
}
