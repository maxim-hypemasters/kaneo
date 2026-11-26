import { chmod, chown, open } from "node:fs/promises";
import path from "node:path";
import type { HermesUser } from "../isolation/hermes-user";
import { ensureDir } from "../isolation/ownership";

/**
 * The runner's Hermes config. Commands matching approvals.deny are refused
 * even under --yolo: pushing and pull requests are the runner's job, done
 * with a token Hermes never sees. A gateway left running ends itself a
 * minute after its last client, while its home still holds this file.
 */
export function buildHermesConfig(): string {
  return [
    "# Written by the Kaneo agent runner for one run.",
    "approvals:",
    "  single_query_mode: deny",
    "  deny:",
    '    - "*git push*"',
    '    - "*git remote set-url*"',
    '    - "*git config --global*"',
    '    - "gh *"',
    "gateway:",
    "  unmanaged_idle_exit_seconds: 60",
    "",
  ].join("\n");
}

/** Hermes's HOME: inside its Hermes home, never the runner's HOME. */
export function hermesHomeDir(hermesHome: string) {
  return path.join(hermesHome, "home");
}

/** Hermes's XDG_RUNTIME_DIR, also inside its Hermes home. */
export function hermesRuntimeDir(hermesHome: string) {
  return path.join(hermesHome, "runtime");
}

/**
 * Hermes's TMPDIR, inside its Hermes home too, so the temporary files and
 * caches of what it runs stay out of the /tmp other runs share.
 */
export function hermesTmpDir(hermesHome: string) {
  return path.join(hermesHome, "tmp");
}

/**
 * A fresh Hermes home for one run, with the runner's config.yaml. Hermes runs
 * each chat in a gateway daemon that serves one home and keeps the
 * environment of the client that started it, so each run gets a home, and a
 * gateway, of its own: its write root applies, and nothing one task leaves
 * there reaches another. Hermes requires its home to be its user's; the home
 * stays root's until it is filled, so nothing can be swapped in meanwhile.
 */
export async function prepareHermesHome(
  hermesHome: string,
  user: HermesUser | null,
) {
  await ensureDir(hermesHome, 0o700, null);
  await ensureDir(hermesHomeDir(hermesHome), 0o700, user);
  await ensureDir(hermesRuntimeDir(hermesHome), 0o700, user);
  await ensureDir(hermesTmpDir(hermesHome), 0o700, user);
  const config = await open(path.join(hermesHome, "config.yaml"), "wx", 0o600);
  try {
    await config.writeFile(buildHermesConfig());
    if (user) await config.chown(user.uid, user.gid);
  } finally {
    await config.close();
  }
  if (user) await chown(hermesHome, user.uid, user.gid);
  await chmod(hermesHome, 0o700);
}
