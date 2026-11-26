import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import type { HermesUser } from "./hermes-user";

export type GatewayStopDeps = {
  proc: string;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  wait: (ms: number) => Promise<void>;
};

const defaults: GatewayStopDeps = {
  proc: "/proc",
  kill: (pid, signal) => process.kill(pid, signal),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Stops the gateway daemon Hermes started for one Hermes home, where Hermes
 * runs as the runner's own user; an isolated slot's processes all end with
 * its user instead. Hermes starts the gateway in a session of its own, so
 * killing Hermes's process group misses it. The pid comes from the gateway's
 * own record, so only a gateway running as `user` is signalled. Without
 * /proc, as on macOS, nothing is, and the gateway exits once Hermes's idle
 * time passes.
 */
export async function stopHermesGateway(
  user: HermesUser,
  hermesHome: string,
  deps: GatewayStopDeps = defaults,
) {
  const record = await readRecord(
    path.join(hermesHome, "gateway.pid"),
    user,
  ).catch(() => null);
  const pid = record === null ? null : parsePid(record);
  if (pid === null || !(await isHermesGateway(deps.proc, pid, user))) return;
  signal(deps, pid, "SIGTERM");
  for (let waited = 0; waited < 5_000; waited += 250) {
    await deps.wait(250);
    if (!(await isHermesGateway(deps.proc, pid, user))) return;
  }
  signal(deps, pid, "SIGKILL");
}

// A gateway that exited since the last look is stopped already.
function signal(deps: GatewayStopDeps, pid: number, name: NodeJS.Signals) {
  try {
    deps.kill(pid, name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

/** The pid in a gateway record: JSON with a pid, or a bare pid. */
export function parsePid(record: string): number | null {
  const text = record.trim();
  let pid: unknown = text;
  if (text.startsWith("{")) {
    try {
      pid = (JSON.parse(text) as { pid?: unknown }).pid;
    } catch {
      return null;
    }
  }
  const value =
    typeof pid === "string" && /^\d+$/.test(pid) ? Number(pid) : pid;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 1
    ? value
    : null;
}

// Hermes's user owns the home, so the record is read without following a
// link and only when it is a small file of that user's.
async function readRecord(file: string, user: HermesUser) {
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== user.uid || stat.size > 65_536)
      return null;
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

// status and cmdline are readable without ptrace rights, unlike environ.
async function isHermesGateway(proc: string, pid: number, user: HermesUser) {
  try {
    const dir = path.join(proc, String(pid));
    const status = await readFile(path.join(dir, "status"), "utf8");
    if (/^State:\s+Z/m.test(status)) return false;
    if (Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]) !== user.uid) return false;
    const args = (await readFile(path.join(dir, "cmdline"), "utf8")).split(
      "\0",
    );
    return args.includes("gateway") && args.includes("run");
  } catch {
    return false;
  }
}
