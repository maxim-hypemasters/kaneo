import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { RunnerConfig } from "../config";
import { prepareHermesHome } from "../hermes/hermes-config";
import {
  killUserProcesses,
  removeUserTempFiles,
} from "../isolation/end-user-processes";
import { ROOT } from "../isolation/hermes-user";
import { ensureDir } from "../isolation/ownership";
import { removeTree } from "../isolation/remove-tree";
import { runPaths } from "./work-paths";

/**
 * A fresh directory for one run. The runner owns it; the slot's user owns
 * only the scratch and out directories and its Hermes home inside, and the
 * checkout once it is cloned, each closed to every other user.
 */
export async function prepareRunDir(config: RunnerConfig, runId: string) {
  const paths = runPaths(config.workDir, runId);
  const user = config.hermesUser;
  await removeRunDir(config, runId);
  await ensureDir(paths.root, 0o755, user ? ROOT : null);
  await ensureDir(paths.scratch, 0o700, user);
  await ensureDir(paths.out, 0o700, user);
  await prepareHermesHome(paths.hermes, user);
  return paths;
}

/**
 * Removes a run's directories and the runner's push copy. With an isolated
 * slot, every process of its user ends first, and what it left in the
 * temporary directories every user shares goes too, so nothing of this run
 * reaches the slot's next one.
 */
export async function removeRunDir(config: RunnerConfig, runId: string) {
  const paths = runPaths(config.workDir, runId);
  const user = config.hermesUser;
  if (user) {
    await killUserProcesses(user);
    await removeUserTempFiles(user);
  }
  if (existsSync(paths.root)) await removeTree(config, paths.root);
  await rm(paths.pushRepo, { recursive: true, force: true });
}
