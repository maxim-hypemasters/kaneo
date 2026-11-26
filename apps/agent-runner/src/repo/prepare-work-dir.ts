import { lstat } from "node:fs/promises";
import path from "node:path";
import type { RunnerConfig } from "../config";
import { ROOT } from "../isolation/hermes-user";
import { ensureDir } from "../isolation/ownership";
import { removeTree } from "../isolation/remove-tree";

/**
 * Lays out the work directory at startup. Runs and push copies a killed
 * process left behind are removed; no run is resumed here. Mirrors are kept
 * unless they aren't root's, as a runner that didn't isolate Hermes left them.
 * With an isolated Hermes, mirrors and push copies are root's alone.
 */
export async function prepareWorkDir(config: RunnerConfig) {
  const owner = config.hermesUser ? ROOT : null;
  const dir = (name: string) => path.join(config.workDir, name);
  await ensureDir(config.workDir, 0o755, owner);
  if (owner) {
    const mirrors = await lstat(dir("mirrors")).catch(() => null);
    if (mirrors && mirrors.uid !== ROOT.uid)
      await removeTree(config, dir("mirrors"));
  }
  await ensureDir(dir("mirrors"), 0o700, owner);
  await removeTree(config, dir("runs"));
  await removeTree(config, dir("push"));
  await ensureDir(dir("push"), 0o700, owner);
  // Hermes reaches its own run by name but can't list the others.
  await ensureDir(dir("runs"), 0o711, owner);
}
