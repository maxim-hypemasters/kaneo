import type { HermesUser } from "./isolation/hermes-user";

export type RunnerConfig = {
  apiUrl: string;
  runnerToken: string;
  githubToken: string | null;
  githubHost: string;
  // Where repositories are cloned from and pushed to: https://<githubHost>.
  gitRemoteBase: string;
  ghBin: string;
  gitAuthorName: string;
  gitAuthorEmail: string;
  hermesBin: string;
  hermesModel: string;
  hermesProvider: string;
  // The image's hermes user, from HERMES_UID. Each concurrency slot gets a
  // copy of the config whose hermesUser is that slot's own user (see
  // slotUser), which is the one Hermes runs as. Null without HERMES_UID, so
  // Hermes runs as the runner's own user and could read its tokens.
  hermesUser: HermesUser | null;
  assessToolsets: string[];
  shipToolsets: string[];
  workDir: string;
  assessConcurrency: number;
  shipConcurrency: number;
  pollIntervalMs: number;
  assessTimeoutMs: number;
  shipTimeoutMs: number;
  assessMaxTurns: number;
  shipMaxTurns: number;
};

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function integer(env: Env, key: string, fallback: number, min: number) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min)
    throw new Error(`${key} must be an integer of at least ${min}`);
  return value;
}

function list(raw: string | undefined, fallback: string[]) {
  const items = (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

/** Kaneo serves its API under /api, whether bundled or hosted apart. */
export function normalizeApiUrl(raw: string): string {
  const base = raw.replace(/\/+$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

/**
 * Switching to another user takes root. The image sets HERMES_UID, so a
 * runner started there as another user refuses to start rather than run
 * Hermes where it can read the runner's tokens.
 */
function hermesUser(
  env: Env,
  currentUid: number | undefined,
): HermesUser | null {
  if (!env.HERMES_UID?.trim()) return null;
  if (currentUid !== 0)
    throw new Error(
      `HERMES_UID is set, but the runner runs as uid ${currentUid ?? "unknown"}, not root, so it can't run Hermes as another user. Start the container as root, without --user or runAsUser.`,
    );
  const uid = integer(env, "HERMES_UID", 0, 1);
  return { uid, gid: integer(env, "HERMES_GID", uid, 1) };
}

export function loadConfig(
  env: Env = process.env,
  currentUid: number | undefined = process.getuid?.(),
): RunnerConfig {
  const workDir = env.WORK_DIR?.trim() || "/work";
  return {
    apiUrl: normalizeApiUrl(required(env, "KANEO_API_URL")),
    runnerToken: required(env, "KANEO_RUNNER_TOKEN"),
    githubToken: env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || null,
    githubHost: env.GITHUB_HOST?.trim() || "github.com",
    gitRemoteBase: `https://${env.GITHUB_HOST?.trim() || "github.com"}`,
    ghBin: env.GH_BIN?.trim() || "gh",
    gitAuthorName: env.GIT_AUTHOR_NAME?.trim() || "Hermes Agent",
    gitAuthorEmail:
      env.GIT_AUTHOR_EMAIL?.trim() || "hermes-agent@users.noreply.github.com",
    hermesBin: env.HERMES_BIN?.trim() || "hermes",
    hermesModel: env.HERMES_MODEL?.trim() || "anthropic/claude-sonnet-5.5",
    hermesProvider: env.HERMES_PROVIDER?.trim() || "openrouter",
    hermesUser: hermesUser(env, currentUid),
    assessToolsets: list(env.ASSESS_TOOLSETS, ["file"]),
    shipToolsets: list(env.SHIP_TOOLSETS, ["file", "terminal", "todo"]),
    workDir,
    assessConcurrency: integer(env, "ASSESS_CONCURRENCY", 2, 0),
    shipConcurrency: integer(env, "SHIP_CONCURRENCY", 1, 0),
    pollIntervalMs: integer(env, "POLL_INTERVAL_MS", 5_000, 500),
    assessTimeoutMs: integer(env, "ASSESS_TIMEOUT_MS", 10 * 60_000, 10_000),
    shipTimeoutMs: integer(env, "SHIP_TIMEOUT_MS", 60 * 60_000, 60_000),
    assessMaxTurns: integer(env, "ASSESS_MAX_TURNS", 40, 1),
    shipMaxTurns: integer(env, "SHIP_MAX_TURNS", 200, 1),
  };
}
