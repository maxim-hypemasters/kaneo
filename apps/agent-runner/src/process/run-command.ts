import { spawn } from "node:child_process";
import type { HermesUser } from "../isolation/hermes-user";

export type CommandResult = { code: number; stdout: string; stderr: string };

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly result: CommandResult,
  ) {
    super(
      `${command} exited with ${result.code}: ${(result.stderr || result.stdout).trim().slice(-500)}`,
    );
  }
}

/**
 * The environment of a program run as another user, when none is given: the
 * runner's own holds its tokens, which that user could read from /proc.
 */
export function commandEnv(
  env: NodeJS.ProcessEnv | undefined,
  user: HermesUser | undefined,
): NodeJS.ProcessEnv {
  if (env) return env;
  return user ? { PATH: process.env.PATH ?? "/usr/bin:/bin" } : process.env;
}

/**
 * Runs a program without a shell. Output is capped so a chatty command can't
 * exhaust memory. An abort, even one before the start, kills the process
 * group.
 */
export function runCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    signal?: AbortSignal;
    check?: boolean;
    // Runs the program as this user, with only PATH unless env is given;
    // the runner must be root.
    user?: HermesUser;
    // Kills what the program left running in its group once it exits.
    killGroupOnExit?: boolean;
    onStdoutLine?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  const limit = 1_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: commandEnv(options.env, options.user),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      uid: options.user?.uid,
      gid: options.user?.gid,
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
      } catch {}
    };
    const kill = () => {
      signalGroup("SIGTERM");
      setTimeout(() => signalGroup("SIGKILL"), 5_000).unref();
    };
    // A listener added to an aborted signal never fires.
    if (options.signal?.aborted) kill();
    else options.signal?.addEventListener("abort", kill, { once: true });
    if (options.killGroupOnExit)
      child.once("exit", () => signalGroup("SIGKILL"));
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (stdout.length < limit) stdout += chunk;
      if (!options.onStdoutLine) return;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) options.onStdoutLine(line);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (stderr.length < limit) stderr += chunk;
    });
    let drain: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(drain);
      options.signal?.removeEventListener("abort", kill);
      if (pending && options.onStdoutLine) options.onStdoutLine(pending);
      const result = { code: code ?? (signal ? 128 : 1), stdout, stderr };
      if (options.check && result.code !== 0)
        reject(new CommandError([command, ...args].join(" "), result));
      else resolve(result);
    };
    child.on("error", (error) => {
      settled = true;
      reject(error);
    });
    // "close" waits for every holder of the output pipes, and a process the
    // program left running in a session of its own can hold them forever, so
    // the result settles shortly after the program exits all the same.
    child.once("exit", (code, signal) => {
      drain = setTimeout(() => {
        // After the I/O already waiting: a busy event loop can run this timer
        // before it reads output the program wrote before exiting.
        setImmediate(() => {
          if (settled) return;
          child.stdout.destroy();
          child.stderr.destroy();
          finish(code, signal);
        });
      }, 2_000);
    });
    child.on("close", finish);
    // A program that exits without reading its input (EPIPE) is not an error.
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}
