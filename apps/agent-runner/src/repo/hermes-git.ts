import type { RunnerConfig } from "../config";
import { hermesHomeDir } from "../hermes/hermes-config";
import { runCommand } from "../process/run-command";
import { gitEnv } from "./git";
import type { RunPaths } from "./work-paths";

/**
 * git in the checkout Hermes worked in, as Hermes's user with its run's
 * HOME and without any
 * token: whatever Hermes left in its .git then runs with Hermes's rights only.
 * Hooks and signing are off, so the repository's own setup can't block it.
 */
export async function hermesGit(
  config: RunnerConfig,
  paths: RunPaths,
  args: readonly string[],
  signal?: AbortSignal,
) {
  const result = await runCommand(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "commit.gpgSign=false",
      ...args,
    ],
    {
      cwd: paths.repo,
      signal,
      check: true,
      user: config.hermesUser ?? undefined,
      env: { ...gitEnv(config, null), HOME: hermesHomeDir(paths.hermes) },
    },
  );
  return result.stdout.trim();
}
