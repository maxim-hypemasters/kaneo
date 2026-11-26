// Credentials only the runner itself may use. Hermes runs shell commands, so
// anything left in its environment could end up in a commit or a log.
const WITHHELD = new Set([
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
  "KANEO_RUNNER_TOKEN",
  "KANEO_GIT_TOKEN",
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_PRIVATE_KEY",
  "GITHUB_PRIVATE_KEY_BASE64",
]);

/**
 * Hermes's environment: the runner's, without its credentials. Empty values
 * count as unset, as for the runner, since Compose passes unset settings as
 * empty ones. A run's Hermes home has no .env, so provider keys reach Hermes
 * only from here.
 */
export function hermesEnv(
  env: NodeJS.ProcessEnv,
  overrides: Record<string, string>,
): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env))
    if (!WITHHELD.has(key) && value) child[key] = value;
  return { ...child, GIT_TERMINAL_PROMPT: "0", ...overrides };
}
