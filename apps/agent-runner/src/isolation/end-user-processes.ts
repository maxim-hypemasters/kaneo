import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "../process/run-command";
import type { HermesUser } from "./hermes-user";

// Directories any user can write to, so a run could leave files there.
const SHARED_TEMP = [
  "/tmp",
  "/var/tmp",
  "/run/lock",
  "/dev/shm",
  "/dev/mqueue",
];

export type EndUserDeps = {
  proc: string;
  killAll: (user: HermesUser) => Promise<void>;
  wait: (ms: number) => Promise<void>;
};

const defaults: EndUserDeps = {
  proc: "/proc",
  // As that user, kill(-1) reaches every process of that user and no other.
  // procps's kill refuses -1; the shell's builtin passes it on. When no
  // process can start, as when the user's processes fill the pid limit, root
  // kills them one by one instead.
  killAll: async (user) => {
    try {
      await runCommand("sh", ["-c", "kill -9 -1"], { user });
    } catch {
      await killEachProcess(user.uid);
    }
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Kills every process of a slot's user and waits until none is left: Hermes,
 * its gateway, and anything that left Hermes's process groups, such as a
 * daemon a build started. Returns false if some survived five seconds.
 */
export async function killUserProcesses(
  user: HermesUser,
  deps: EndUserDeps = defaults,
) {
  // A process can fork while the kill goes round; kill again until none is left.
  for (let waited = 0; waited <= 5_000; waited += 100) {
    await deps.killAll(user);
    if (!(await userHasProcesses(user.uid, deps.proc))) return true;
    await deps.wait(100);
  }
  return false;
}

/**
 * Deletes what a slot's user left where every user can write: its files in
 * the shared temporary directories, and its shared memory, semaphores and
 * message queues. Call it once the user's processes are gone.
 */
export async function removeUserTempFiles(user: HermesUser) {
  await removeUserIpc(user);
  const owned = [
    ...SHARED_TEMP,
    "-xdev",
    "-mindepth",
    "1",
    "-user",
    String(user.uid),
  ];
  // As that user, so it deletes only its own files, wherever they are. A run
  // can make one of its directories unreadable to itself; open each before
  // find reads it (";", not "+").
  await runCommand(
    "find",
    [...owned, "-type", "d", "-exec", "chmod", "u+rwx", "{}", ";"],
    { user },
  );
  await runCommand("find", [...owned, "-delete"], { user });
  // What survives that, such as a tree nested deeper than a path can name,
  // root removes whole. Only entries right in the shared directories: their
  // parent is fixed, so no one can lead root elsewhere meanwhile, and GNU rm
  // never follows a link inside.
  for (const dir of SHARED_TEMP)
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const entry = path.join(dir, name);
      const stat = await lstat(entry).catch(() => null);
      if (stat?.uid === user.uid) await runCommand("rm", ["-rf", "--", entry]);
    }
}

// The user may remove objects it owns or created and no others. Their ids
// come from /proc: ipcrm -a lists only objects their owner can read.
async function removeUserIpc(user: HermesUser) {
  const args: string[] = [];
  for (const [table, flag] of [
    ["shm", "-m"],
    ["msg", "-q"],
    ["sem", "-s"],
  ] as const) {
    const rows = await readFile(`/proc/sysvipc/${table}`, "utf8").catch(
      () => "",
    );
    for (const row of rows.split("\n").slice(1)) {
      const id = row.trim().split(/\s+/)[1];
      if (id && /^\d+$/.test(id)) args.push(flag, id);
    }
  }
  if (args.length) await runCommand("ipcrm", args, { user });
}

/** Whether a process of this user is alive; zombies don't count. */
export async function userHasProcesses(uid: number, proc = "/proc") {
  return (await userProcesses(uid, proc)).length > 0;
}

async function killEachProcess(uid: number) {
  for (const pid of await userProcesses(uid)) {
    // Checked again right before the signal, so a pid reused meanwhile by
    // another user's process is left alone.
    if (!(await userProcesses(uid, "/proc", [pid])).length) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

async function userProcesses(
  uid: number,
  proc = "/proc",
  only?: number[],
): Promise<number[]> {
  const pids: number[] = [];
  const entries =
    only?.map(String) ?? (await readdir(proc).catch(() => [] as string[]));
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const status = await readFile(
      path.join(proc, entry, "status"),
      "utf8",
    ).catch(() => "");
    if (/^State:\s+Z/m.test(status)) continue;
    if (Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]) === uid)
      pids.push(Number(entry));
  }
  return pids;
}
