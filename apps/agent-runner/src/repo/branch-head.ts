import type { RunnerConfig } from "../config";
import { git, gitSucceeds } from "./git";

/** The commit a branch of a bare repository, such as a mirror, is at, or null. */
export async function branchHead(
  config: RunnerConfig,
  gitDir: string,
  branch: string,
): Promise<string | null> {
  const args = [
    "--git-dir",
    gitDir,
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branch}^{commit}`,
  ];
  if (!(await gitSucceeds(config, args))) return null;
  return git(config, args);
}
