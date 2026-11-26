import { rmSync } from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parsePid, stopHermesGateway } from "./stop-hermes-gateway";

const GATEWAY = [
  "/opt/hermes/.venv/bin/python",
  "-m",
  "hermes_cli.main",
  "gateway",
  "run",
  "--idle-exit",
];

async function setup(
  processes: Record<string, { uid: number; args: string[] }>,
) {
  const root = await mkdtemp(path.join(tmpdir(), "gateway-"));
  const proc = path.join(root, "proc");
  const home = path.join(root, "hermes");
  await mkdir(home, { recursive: true });
  for (const [pid, { uid, args }] of Object.entries(processes)) {
    await mkdir(path.join(proc, pid), { recursive: true });
    await writeFile(
      path.join(proc, pid, "status"),
      `Name:\tpython\nState:\tS (sleeping)\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\n`,
    );
    await writeFile(path.join(proc, pid, "cmdline"), `${args.join("\0")}\0`);
  }
  const signals: Array<[number, NodeJS.Signals]> = [];
  const deps = {
    proc,
    kill: (pid: number, signal: NodeJS.Signals) => {
      signals.push([pid, signal]);
      // The process exits on SIGTERM.
      rmSync(path.join(proc, String(pid)), { recursive: true, force: true });
    },
    wait: async () => {},
  };
  return { home, proc, signals, deps };
}

// The test's own user owns the files it writes.
const me = { uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 };

describe("stopHermesGateway", () => {
  it("stops the gateway its record names", async () => {
    const ctx = await setup({ "100": { uid: me.uid, args: GATEWAY } });
    await writeFile(
      path.join(ctx.home, "gateway.pid"),
      JSON.stringify({ pid: 100, start_time: 123 }),
    );
    await stopHermesGateway(me, ctx.home, ctx.deps);
    expect(ctx.signals).toEqual([[100, "SIGTERM"]]);
  });

  it("leaves a process alone that isn't Hermes's user's gateway", async () => {
    const ctx = await setup({
      "100": { uid: me.uid + 1, args: GATEWAY },
      "101": {
        uid: me.uid,
        args: ["node", "/opt/kaneo-agent-runner/index.js"],
      },
    });
    for (const pid of [100, 101]) {
      await writeFile(path.join(ctx.home, "gateway.pid"), String(pid));
      await stopHermesGateway(me, ctx.home, ctx.deps);
    }
    expect(ctx.signals).toEqual([]);
  });

  it("doesn't follow a record replaced by a link", async () => {
    const ctx = await setup({ "100": { uid: me.uid, args: GATEWAY } });
    const elsewhere = path.join(ctx.home, "..", "elsewhere.pid");
    await writeFile(elsewhere, "100");
    await symlink(elsewhere, path.join(ctx.home, "gateway.pid"));
    await stopHermesGateway(me, ctx.home, ctx.deps);
    expect(ctx.signals).toEqual([]);
  });

  it("does nothing without a gateway record", async () => {
    const ctx = await setup({ "100": { uid: me.uid, args: GATEWAY } });
    await stopHermesGateway(me, ctx.home, ctx.deps);
    expect(ctx.signals).toEqual([]);
  });

  it("counts a gateway that exits before the signal as stopped", async () => {
    const ctx = await setup({ "100": { uid: me.uid, args: GATEWAY } });
    await writeFile(path.join(ctx.home, "gateway.pid"), "100");
    const gone = Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    await expect(
      stopHermesGateway(me, ctx.home, {
        ...ctx.deps,
        kill: () => {
          throw gone;
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("parsePid", () => {
  it("reads JSON records and bare pids", () => {
    expect(parsePid('{"pid": 42, "start_time": 1}')).toBe(42);
    expect(parsePid("42\n")).toBe(42);
    expect(parsePid('{"pid": "42"}')).toBe(42);
  });

  it("refuses anything that isn't a process other than init", () => {
    for (const record of ["", "1", "0", "-5", "{", '{"pid": 1.5}', "abc"])
      expect(parsePid(record)).toBeNull();
  });
});
