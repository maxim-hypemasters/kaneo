import path from "node:path";
import type { RunnerConfig } from "../config";
import { hermesGit } from "./hermes-git";
import type { RunPaths } from "./work-paths";

/**
 * Commits what Hermes left uncommitted, then packs its commits since the
 * start into a bundle in the run's out directory, all as Hermes's user.
 * Returns null when there are no new commits.
 */
export async function bundleHermesWork(
  config: RunnerConfig,
  input: {
    paths: RunPaths;
    startSha: string;
    message: string;
    signal?: AbortSignal;
  },
): Promise<string | null> {
  const run = (args: string[]) =>
    hermesGit(config, input.paths, args, input.signal);
  if (await run(["status", "--porcelain"])) {
    await run(["add", "-A"]);
    await run(["commit", "--quiet", "--no-verify", "-m", input.message]);
  }
  const added = Number(
    await run(["rev-list", "--count", `${input.startSha}..HEAD`]),
  );
  if (!added) return null;
  const bundle = path.join(input.paths.out, "work.bundle");
  await run([
    "bundle",
    "create",
    "--quiet",
    bundle,
    "HEAD",
    `^${input.startSha}`,
  ]);
  return bundle;
}
