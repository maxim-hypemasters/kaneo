import { runAssess } from "./assess/run-assess";
import { loadConfig } from "./config";
import { createGitHubTokens } from "./github/github-tokens";
import { type AgentRunKind, createKaneoClient } from "./kaneo/client";
import { dispatchRun, type RunHandler } from "./loop/dispatch-run";
import { pollLoop } from "./loop/poll-loop";
import { ensureSlotUsers, slotUser } from "./isolation/slot-users";
import { createRedactor } from "./redact";
import { prepareWorkDir } from "./repo/prepare-work-dir";
import type { RunDeps } from "./run-deps";
import { runShip } from "./ship/run-ship";
import { runStart } from "./start/run-start";
import { RUNNER_VERSION } from "./version";

const RUN_HANDLERS = {
  assess: runAssess,
  ship: runShip,
  start: runStart,
} satisfies Record<AgentRunKind, RunHandler>;

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
    config.github?.kind === "token" ? config.github.token : null,
    ...(config.github?.kind === "app"
      ? [
          config.github.privateKey,
          process.env.GITHUB_PRIVATE_KEY ?? null,
          process.env.GITHUB_PRIVATE_KEY_BASE64 ?? null,
        ]
      : []),
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
      `WARNING: credential isolation is off. Hermes runs as this process's user (uid ${process.getuid?.() ?? "unknown"}) and can read the runner token and the GitHub credentials. Run the runner as root with HERMES_UID set, as the image does.`,
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
    kaneo: createKaneoClient(config.apiUrl, config.runnerToken, {
      canPush: config.github !== null,
    }),
    github: createGitHubTokens(config.github, config.githubHost),
    redact,
    shutdown: shutdown.signal,
    log,
  };
  const loops: Promise<void>[] = [];
  // Each loop claims one kind and takes runs of that kind only.
  const startLoop = (
    loopDeps: RunDeps,
    kind: AgentRunKind,
    refusedNote?: string,
  ) => {
    loops.push(
      pollLoop({
        kaneo: deps.kaneo,
        kinds: [kind],
        intervalMs: config.pollIntervalMs,
        shutdown: shutdown.signal,
        log,
        refusedNote,
        handle: (claim) =>
          dispatchRun({ [kind]: RUN_HANDLERS[kind] }, loopDeps, claim),
      }),
    );
  };
  let nextSlot = 0;
  const startSlots = (count: number, kind: "assess" | "ship") => {
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
      startLoop(slotDeps, kind);
    }
  };
  startSlots(config.assessConcurrency, "assess");
  if (config.github) {
    startSlots(config.shipConcurrency, "ship");
    // Start runs no Hermes, so its loop takes no slot user. Its own loop
    // keeps an older Kaneo's refusal of the kind away from the others.
    startLoop(
      { ...deps, config: { ...config, hermesUser: null } },
      "start",
      `Kaneo refused to hand out start runs, as a Kaneo older than runner v${RUNNER_VERSION} does; readiness checks and Ship go on, and Start keeps asking`,
    );
    log(
      config.github.kind === "app"
        ? `Pushes as GitHub App ${config.github.appId}, with a token per repository`
        : "Pushes with GH_TOKEN",
    );
  } else
    log(
      "No GitHub credentials: assessing only; Start only moves tasks, and Ship runs wait for a runner that can push",
    );

  log(
    `v${RUNNER_VERSION} polling ${config.apiUrl} with ${config.hermesProvider}/${config.hermesModel} (${config.assessConcurrency} assess, ${config.github ? config.shipConcurrency : 0} ship, ${config.github ? 1 : 0} start)`,
  );
  await Promise.all(loops);
}

main().catch((error: unknown) => {
  console.error(`[agent-runner] ${(error as Error).message}`);
  process.exit(1);
});
