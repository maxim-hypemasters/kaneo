import type { RunnerConfig } from "../config";
import { runCommand } from "../process/run-command";

// Reads the token from the environment of this one git process, so it never
// appears in arguments, remotes or any repository's config.
const CREDENTIAL_HELPER =
  '!f() { echo username=x-access-token; echo "password=$KANEO_GIT_TOKEN"; }; f';

export function repositoryUrl(config: RunnerConfig, repository: string) {
  return `${config.gitRemoteBase}/${repository}.git`;
}

/** The runner's git ignores global and system config, so nothing outside the repository steers it. */
export function gitEnv(config: RunnerConfig, token: string | null) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: config.gitAuthorName,
    GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
    GIT_COMMITTER_NAME: config.gitAuthorName,
    GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
    ...(token ? { KANEO_GIT_TOKEN: token } : {}),
  };
}

function gitArgs(config: RunnerConfig, args: readonly string[], auth: boolean) {
  return [
    "-c",
    "core.hooksPath=/dev/null",
    // The helper answers only for the GitHub host.
    ...(auth
      ? [
          "-c",
          "credential.helper=",
          "-c",
          `credential.https://${config.githubHost}.helper=${CREDENTIAL_HELPER}`,
        ]
      : []),
    ...args,
  ];
}

/**
 * The runner's own git, run only in repositories Hermes can't write: the
 * mirrors, the push copies, and a run's checkout before Hermes gets it.
 */
export async function git(
  config: RunnerConfig,
  args: readonly string[],
  options: { cwd?: string; token?: string | null; signal?: AbortSignal } = {},
) {
  const token = options.token ?? null;
  const result = await runCommand(
    "git",
    gitArgs(config, args, Boolean(token)),
    {
      cwd: options.cwd,
      env: gitEnv(config, token),
      signal: options.signal,
      check: true,
    },
  );
  return result.stdout.trim();
}

/** Whether a git command exits 0, for checks such as rev-parse --verify. */
export async function gitSucceeds(
  config: RunnerConfig,
  args: readonly string[],
  options: { cwd?: string } = {},
): Promise<boolean> {
  const result = await runCommand("git", gitArgs(config, args, false), {
    cwd: options.cwd,
    env: gitEnv(config, null),
  });
  return result.code === 0;
}
