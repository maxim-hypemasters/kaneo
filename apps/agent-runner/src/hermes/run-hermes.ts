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

// Hermes's explanation of an abnormal ending ("explainer.no_reply_prefix"
// in its English locale, which the runner pins, as it keeps the explainer
// on): a paragraph of its own, alone or after the fragment of a stream that
// broke off.
const NO_REPLY = /(^|\n\n)⚠️ No reply: (.*)/;

export type HermesOutcome = {
  // A completed turn with a real answer. `hermes chat` (not -z) exits 0 for
  // any turn that didn't fail or stop partway, also when the model gave no
  // reply and Hermes ended the turn with text of its own: an explanation,
  // narration recovered from earlier, an error notice. So a real answer is
  // also one the model streamed after Hermes's last tool round, which the
  // result's text starts with (Hermes may add a footer), without Hermes's
  // explanation of an abnormal ending. Exit 1 is a turn stopped partway, its
  // turn limit included, or failed; 130 an interrupted one. A killed client
  // writes no result at all.
  finished: boolean;
  // An answer worth reading even if the work stopped, as Hermes's summary
  // at its turn limit (exit code 1): a real answer from a turn that wasn't
  // interrupted and has no error.
  answered: boolean;
  exitCode: number;
  // The final answer, from the result record. Never what Hermes said along
  // the way, which is narration.
  text: string;
  // Why it didn't finish; null when it did.
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
  // Filled from the stdout callback while the process runs: the result, and
  // what the model streamed since Hermes's last tool round.
  const seen: {
    result: Extract<HermesRecord, { type: "result" }> | null;
    afterTools: string;
  } = { result: null, afterTools: "" };
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
      // English, with its explainer on, so an abnormal ending carries the
      // NO_REPLY paragraph.
      HERMES_LANGUAGE: "en",
      HERMES_TURN_COMPLETION_EXPLAINER: "1",
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
      else if (record.type === "text") seen.afterTools += record.text;
      else {
        if (record.type === "tool_use" || record.type === "tool_result")
          seen.afterTools = "";
        const event = toProgressEvent(record);
        if (event) input.onEvent?.(event);
      }
    },
    // Cleanup never replaces Hermes's outcome; removeRunDir ends the user's
    // processes again.
  }).finally(() => endHermes(config, input.hermesHome).catch(() => {}));
  const final = seen.result;
  const exitCode = final?.exit_code ?? command.code;
  const text = (final?.text ?? "").trim();
  const streamed = seen.afterTools.trim();
  const real =
    streamed !== "" && text.startsWith(streamed) && !NO_REPLY.test(text);
  const finished = final !== null && final.exit_code === 0 && real;
  return {
    finished,
    answered: final !== null && final.exit_code !== 130 && !final.error && real,
    exitCode,
    text,
    error: finished ? null : whyUnfinished(final, text, command),
  };
}

// Hermes's own error when it gave one; otherwise what its ending means.
function whyUnfinished(
  final: Extract<HermesRecord, { type: "result" }> | null,
  text: string,
  command: { code: number; stderr: string },
) {
  if (final?.error) return final.error;
  if (final?.exit_code === 130) return "Hermes was interrupted (exit code 130)";
  if (final?.exit_code === 1)
    return "Hermes stopped before finishing its turn, for example at its turn limit (exit code 1)";
  if (final?.exit_code === 0) {
    // Hermes's explanation if it gave one, else the start of its own text.
    const detail = NO_REPLY.exec(text)?.[2] ?? text.split("\n")[0];
    return `Hermes ended its turn without a final answer from the model${detail ? `: ${detail.slice(0, 300)}` : ""}`;
  }
  if (final) return `Hermes ended with exit code ${final.exit_code}`;
  const stderr = command.stderr.trim().split("\n").slice(-3).join(" ");
  return `Hermes's session ended before its result, with exit code ${command.code}${stderr ? `: ${stderr}` : ""}`;
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
