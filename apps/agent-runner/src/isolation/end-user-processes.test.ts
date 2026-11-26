import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { killUserProcesses } from "./end-user-processes";

const USER = { uid: 10001, gid: 10001 };

async function fakeProc(
  processes: Record<string, { uid: number; state?: string }>,
) {
  const proc = await mkdtemp(path.join(tmpdir(), "proc-"));
  for (const [pid, { uid, state = "S (sleeping)" }] of Object.entries(
    processes,
  )) {
    await mkdir(path.join(proc, pid));
    await writeFile(
      path.join(proc, pid, "status"),
      `Name:\tnode\nState:\t${state}\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\n`,
    );
  }
  return proc;
}

describe("killUserProcesses", () => {
  it("kills until no process of the user is left", async () => {
    const proc = await fakeProc({ "10": { uid: 10001 }, "11": { uid: 0 } });
    let kills = 0;
    const done = await killUserProcesses(USER, {
      proc,
      killAll: async (user) => {
        expect(user).toEqual(USER);
        kills++;
        // The second round finds the process the first one raced.
        if (kills === 2) await rm(path.join(proc, "10"), { recursive: true });
      },
      wait: async () => {},
    });
    expect(done).toBe(true);
    expect(kills).toBe(2);
  });

  it("ignores zombies and other users' processes", async () => {
    const proc = await fakeProc({
      "10": { uid: 10001, state: "Z (zombie)" },
      "11": { uid: 10002 },
    });
    let kills = 0;
    const done = await killUserProcesses(USER, {
      proc,
      killAll: async () => {
        kills++;
      },
      wait: async () => {},
    });
    expect(done).toBe(true);
    expect(kills).toBe(1);
  });

  it("reports a process that survives", async () => {
    const proc = await fakeProc({
      "10": { uid: 10001, state: "D (disk sleep)" },
    });
    const done = await killUserProcesses(USER, {
      proc,
      killAll: async () => {},
      wait: async () => {},
    });
    expect(done).toBe(false);
  });
});
