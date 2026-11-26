import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { RunnerConfig } from "../config";
import { ROOT } from "../isolation/hermes-user";
import { chownTree, ensureDir } from "../isolation/ownership";
import { git, gitSucceeds, repositoryUrl } from "./git";
import { withRepoLock } from "./repo-lock";
import { mirrorPath, runPaths } from "./work-paths";

/** Fetches the cached mirror, or clones it. Call it under the repo lock. */
async function updateMirror(
  config: RunnerConfig,
  repository: string,
  signal?: AbortSignal,
) {
  const mirror = mirrorPath(config.workDir, repository);
  if (existsSync(mirror))
    await git(config, ["--git-dir", mirror, "fetch", "--prune", "origin"], {
      auth: true,
      signal,
    });
  else {
    await mkdir(path.dirname(mirror), { recursive: true });
    await git(
      config,
      [
        "clone",
        "--mirror",
        "--quiet",
        repositoryUrl(config, repository),
        mirror,
      ],
      { auth: true, signal },
    );
  }
  return mirror;
}

/**
 * Hermes's working copy for one run, cloned from the cached mirror into the
 * run directory prepareRunDir made. With a branch name it checks out that
 * branch: the existing remote one when a previous Ship pushed it, so the pull
 * request keeps growing, otherwise a new one from the base branch. The runner
 * prepares it, then hands it to Hermes's user; it never runs git in it again.
 */
export async function prepareCheckout(
  config: RunnerConfig,
  input: {
    runId: string;
    repository: string;
    baseBranch: string;
    branch?: string;
    signal?: AbortSignal;
  },
) {
  const dir = runPaths(config.workDir, input.runId).repo;
  // Closed to every other user from the first file on, as the rest of the
  // run's directories are; git clones into an empty directory as it is.
  await ensureDir(dir, 0o700, config.hermesUser ? ROOT : null);
  // The clone stays under the lock too, so another run's fetch can't repack
  // the mirror while it is copied.
  await withRepoLock(input.repository, async () => {
    const mirror = await updateMirror(config, input.repository, input.signal);
    // Copies, not hard links: the checkout becomes Hermes's, the mirror never.
    await git(
      config,
      ["clone", "--quiet", "--no-checkout", "--no-hardlinks", mirror, dir],
      { signal: input.signal },
    );
  });
  await git(
    config,
    ["remote", "set-url", "origin", repositoryUrl(config, input.repository)],
    { cwd: dir },
  );
  const exists = (ref: string) =>
    gitSucceeds(config, ["rev-parse", "--verify", "--quiet", ref], {
      cwd: dir,
    });
  const baseRef = `refs/remotes/origin/${input.baseBranch}`;
  if (!(await exists(baseRef)))
    throw new Error(`Base branch ${input.baseBranch} was not found`);
  const continued =
    input.branch !== undefined &&
    (await exists(`refs/remotes/origin/${input.branch}`));
  const startRef = continued
    ? `origin/${input.branch}`
    : `origin/${input.baseBranch}`;
  await git(
    config,
    ["checkout", "--quiet", "-B", input.branch ?? input.baseBranch, startRef],
    { cwd: dir, signal: input.signal },
  );
  const startSha = await git(config, ["rev-parse", "HEAD"], { cwd: dir });
  if (config.hermesUser) await chownTree([dir], config.hermesUser);
  return { dir, startSha, continued };
}

export type Checkout = Awaited<ReturnType<typeof prepareCheckout>>;
