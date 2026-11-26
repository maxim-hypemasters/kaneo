import { runAssess } from "./assess/run-assess";
import { loadConfig } from "./config";
import { createKaneoClient } from "./kaneo/client";
import { pollLoop } from "./loop/poll-loop";
import { ensureSlotUsers, slotUser } from "./isolation/slot-users";
import { createRedactor } from "./redact";
import { prepareWorkDir } from "./repo/prepare-work-dir";
import type { RunDeps } from "./run-deps";
import { runShip } from "./ship/run-ship";
import { RUNNER_VERSION } from "./version";

const PROVIDER_KEYS = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "NOUS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
];

async function main() {
  const config = loadConfig();
  const redact = createRedactor([
    config.runnerToken,
    config.githubToken,
    ...PROVIDER_KEYS.map((key) => process.env[key] ?? null),
  ]);
  const log = (message: string) =>
    console.log(`[agent-runner] ${redact(message)}`);

  const slots = config.assessConcurrency + config.shipConcurrency;
  if (config.hermesUser) {
    await ensureSlotUsers(config.hermesUser, slots);
    const first = slotUser(config.hermesUser, 0).uid;
    log(
      `Hermes runs as uids ${first}-${first + slots - 1}, one per run at a time, apart from the runner's tokens`,
    );
  } else
    log(
      `WARNING: credential isolation is off. Hermes runs as this process's user (uid ${process.getuid?.() ?? "unknown"}) and can read the runner token and GH_TOKEN. Run the runner as root with HERMES_UID set, as the image does.`,
    );
  // From here on, what the runner and the programs it starts create is
  // private to its owner unless set otherwise, in shared /tmp too. Not
  // before: useradd above must leave /etc/passwd readable.
  process.umask(0o077);
  await prepareWorkDir(config);

  const shutdown = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      log(`${signal}: stopping; unfinished runs return to the queue`);
      shutdown.abort();
    });

  const deps: RunDeps = {
    config,
    kaneo: createKaneoClient(config.apiUrl, config.runnerToken),
    redact,
    shutdown: shutdown.signal,
    log,
  };
  const loops: Promise<void>[] = [];
  let nextSlot = 0;
  const start = (count: number, kind: "assess" | "ship") => {
    for (let index = 0; index < count; index++) {
      const slot = nextSlot++;
      // Each slot runs Hermes as a user of its own.
      const slotDeps: RunDeps = config.hermesUser
        ? {
            ...deps,
            config: {
              ...config,
              hermesUser: slotUser(config.hermesUser, slot),
            },
          }
        : deps;
      loops.push(
        pollLoop({
          kaneo: deps.kaneo,
          kinds: [kind],
          intervalMs: config.pollIntervalMs,
          shutdown: shutdown.signal,
          log,
          handle: (claim) => {
            log(`${kind} ${claim.run.id} for ${claim.context.task.ticketId}`);
            return kind === "assess"
              ? runAssess(slotDeps, claim)
              : runShip(slotDeps, claim);
          },
        }),
      );
    }
  };
  start(config.assessConcurrency, "assess");
  if (config.githubToken) start(config.shipConcurrency, "ship");
  else
    log(
      "No GH_TOKEN: assessing only; Ship runs wait for a runner that can push",
    );

  log(
    `v${RUNNER_VERSION} polling ${config.apiUrl} with ${config.hermesProvider}/${config.hermesModel} (${config.assessConcurrency} assess, ${config.githubToken ? config.shipConcurrency : 0} ship)`,
  );
  await Promise.all(loops);
}

main().catch((error: unknown) => {
  console.error(`[agent-runner] ${(error as Error).message}`);
  process.exit(1);
});
