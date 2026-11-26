import { runCommand } from "../process/run-command";
import type { HermesUser } from "./hermes-user";

/**
 * The user one concurrency slot runs Hermes as: HERMES_UID plus one for the
 * first slot, and so on. A slot runs one run at a time, so killing every
 * process of its user ends what that run left behind and nothing of another
 * slot's. HERMES_UID itself, the image's hermes user, is left to the image's
 * bootstrap and owns files every slot would otherwise share.
 */
export function slotUser(base: HermesUser, slot: number): HermesUser {
  const id = base.uid + 1 + slot;
  return { uid: id, gid: id };
}

/**
 * Gives each slot's user and group an entry, as tools such as git and npm
 * expect for the user they run as. Entries the image already has are kept.
 */
export async function ensureSlotUsers(base: HermesUser, count: number) {
  for (let slot = 0; slot < count; slot++) {
    const { uid, gid } = slotUser(base, slot);
    const name = `hermes-run-${uid}`;
    const exists = async (database: string, id: number) =>
      (await runCommand("getent", [database, String(id)])).code === 0;
    if (!(await exists("group", gid)))
      await runCommand("groupadd", ["--gid", String(gid), name], {
        check: true,
      });
    if (!(await exists("passwd", uid)))
      await runCommand(
        "useradd",
        [
          "--uid",
          String(uid),
          "--gid",
          String(gid),
          "--no-create-home",
          "--home-dir",
          "/nonexistent",
          "--shell",
          "/usr/sbin/nologin",
          name,
        ],
        { check: true },
      );
  }
}
