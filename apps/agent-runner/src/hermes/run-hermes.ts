import path from "node:path";
import type { RunnerConfig } from "../config";
import { killUserProcesses } from "../isolation/end-user-processes";
import { stopHermesGateway } from "../isolation/stop-hermes-gateway";
import type { ProgressEvent } from "../kaneo/client";
import { runCommand } from "../process/run-command";
import { hermesEnv } from "./child-env";
import { hermesHomeDir, hermesRuntimeDir, hermesTmpDir } from "./hermes-config";
import {
  type HermesRecord,
  parseRecord,
  toProgressEvent,
} from "./parse-stream-json";

export type HermesOutcome = {
  exitCode: number;
  text: string;
  error: string | null;
};

/**
 * One non-interactive Hermes session in `cwd`, prompt on stdin, progress
 * from its stream-json records, served from the run's own Hermes home.
 * File-tool writes are confined to writeRoot. With HERMES_UID set it runs as
 * the slot's own user, so it can't read the runner's environment or files,
 * and when it exits every process of that user is killed, its gateway
 * included. Without it, Hermes runs as the runner's own user and only the
 * gateway its Hermes home records is stopped.
 */
export async function runHermes(
  config: RunnerConfig,
  input: {
    prompt: string;
    cwd: string;
    hermesHome: string;
    toolsets: string[];
    maxTurns: number;
    yolo: boolean;
    writeRoot: string;
    signal: AbortSignal;
    onEvent?: (event: ProgressEvent) => void;
  },
): Promise<HermesOutcome> {
  // Filled from the stdout callback while the process runs.
  const seen: {
    result: Extract<HermesRecord, { type: "result" }> | null;
    text: string;
  } = { result: null, text: "" };
  const args = [
    "chat",
    "--query-file",
    "-",
    "--format",
    "stream-json",
    "--source",
    "tool",
    "--in",
    input.cwd,
    "-m",
    config.hermesModel,
    "--provider",
    config.hermesProvider,
    "-t",
    input.toolsets.join(","),
    "--max-turns",
    String(input.maxTurns),
    ...(input.yolo ? ["--yolo"] : []),
  ];
  const home = hermesHomeDir(input.hermesHome);
  const command = await runCommand(config.hermesBin, args, {
    cwd: input.cwd,
    input: input.prompt,
    signal: input.signal,
    user: config.hermesUser ?? undefined,
    killGroupOnExit: true,
    env: hermesEnv(process.env, {
      HOME: home,
      // Tools Hermes installs for itself come last, so they never stand in
      // for the image's, and are never on the runner's own PATH.
      PATH: [process.env.PATH, path.join(home, ".local", "bin")]
        .filter(Boolean)
        .join(":"),
      HERMES_HOME: input.hermesHome,
      // The image's runtime directory belongs to its own hermes user.
      XDG_RUNTIME_DIR: hermesRuntimeDir(input.hermesHome),
      TMPDIR: hermesTmpDir(input.hermesHome),
      TMP: hermesTmpDir(input.hermesHome),
      TEMP: hermesTmpDir(input.hermesHome),
      HERMES_WRITE_SAFE_ROOT: input.writeRoot,
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
    }),
    onStdoutLine: (line: string) => {
      const record = parseRecord(line);
      if (!record) return;
      if (record.type === "result") seen.result = record;
      else if (record.type === "text") seen.text += record.text;
      else {
        const event = toProgressEvent(record);
        if (event) input.onEvent?.(event);
      }
    },
    // Cleanup never replaces Hermes's outcome; removeRunDir ends the user's
    // processes again.
  }).finally(() => endHermes(config, input.hermesHome).catch(() => {}));
  const final = seen.result;
  const exitCode = final?.exit_code ?? command.code;
  return {
    exitCode,
    text: (final?.text || seen.text).trim(),
    error:
      final?.error ??
      (exitCode === 0
        ? null
        : command.stderr.trim().split("\n").slice(-3).join(" ")),
  };
}

// What Hermes left running: with an isolated slot, every process of its user;
// otherwise the gateway Hermes started in a session of its own.
async function endHermes(config: RunnerConfig, hermesHome: string) {
  if (config.hermesUser) await killUserProcesses(config.hermesUser);
  else if (process.getuid && process.getgid)
    await stopHermesGateway(
      { uid: process.getuid(), gid: process.getgid() },
      hermesHome,
    );
}
