import { describe, expect, it } from "vite-plus/test";
import { commandEnv, runCommand } from "./run-command";

describe("commandEnv", () => {
  it("never passes the runner's environment to another user", () => {
    const env = commandEnv(undefined, { uid: 10001, gid: 10001 });
    expect(Object.keys(env)).toEqual(["PATH"]);
    expect(commandEnv(undefined, undefined)).toBe(process.env);
    expect(commandEnv({ A: "1" }, { uid: 10001, gid: 10001 })).toEqual({
      A: "1",
    });
  });
});

describe("runCommand", () => {
  it("kills a program whose signal aborted before it started", async () => {
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();
    const result = await runCommand("sleep", ["30"], {
      signal: controller.signal,
    });
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it("settles soon after a program exits, though what it left holds its output", async () => {
    const started = Date.now();
    const result = await runCommand("sh", ["-c", "setsid sleep 30 & echo $!"]);
    process.kill(Number(result.stdout.trim()), "SIGKILL");
    expect(result.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("kills what a program left running in its group once it exits", async () => {
    const started = Date.now();
    const result = await runCommand("sh", ["-c", "sleep 30 & echo started"], {
      killGroupOnExit: true,
    });
    expect(result.stdout.trim()).toBe("started");
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});
