import { chmod, chown, lstat, mkdir, rm } from "node:fs/promises";
import { runCommand } from "../process/run-command";
import type { HermesUser } from "./hermes-user";

/**
 * Makes dir a directory with this mode and, when given, this owner. Anything
 * else at the path, such as a symlink, is replaced first.
 */
export async function ensureDir(
  dir: string,
  mode: number,
  owner: HermesUser | null,
) {
  const stat = await lstat(dir).catch(() => null);
  if (stat && !stat.isDirectory()) await rm(dir, { force: true });
  await mkdir(dir, { recursive: true });
  if (owner) await chown(dir, owner.uid, owner.gid);
  await chmod(dir, mode);
}

/** Hands trees the runner created to Hermes, without following symlinks. */
export async function chownTree(paths: readonly string[], user: HermesUser) {
  await runCommand(
    "chown",
    ["-R", "-h", `${user.uid}:${user.gid}`, "--", ...paths],
    { check: true },
  );
}
