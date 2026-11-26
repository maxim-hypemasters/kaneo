import { rm } from "node:fs/promises";
import type { RunnerConfig } from "../config";
import { runCommand } from "../process/run-command";

/**
 * Deletes a tree with directories Hermes's users own inside. Node's fs.rm
 * goes by path, so a symlink swapped into such a directory meanwhile could
 * lead root out of the tree; GNU rm works from directory descriptors and
 * never follows one. Without isolation Hermes runs as the runner's own user,
 * and fs.rm will do.
 */
export async function removeTree(config: RunnerConfig, dir: string) {
  if (config.hermesUser)
    await runCommand("rm", ["-rf", "--one-file-system", "--", dir], {
      check: true,
    });
  else await rm(dir, { recursive: true, force: true });
}
