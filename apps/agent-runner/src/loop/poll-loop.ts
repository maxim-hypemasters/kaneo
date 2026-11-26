import { setTimeout as sleep } from "node:timers/promises";
import type { AgentRunKind, KaneoClient, RunClaim } from "../kaneo/client";

const MAX_BACKOFF_MS = 60_000;

/**
 * One worker slot: claims a run of the given kinds, handles it, repeats.
 * Errors reaching Kaneo back off instead of hammering it. Shutdown ends the
 * wait between polls at once.
 */
export async function pollLoop(input: {
  kaneo: KaneoClient;
  kinds: AgentRunKind[];
  intervalMs: number;
  handle: (claim: RunClaim) => Promise<void>;
  shutdown: AbortSignal;
  log: (message: string) => void;
}) {
  let failures = 0;
  while (!input.shutdown.aborted) {
    let claim: RunClaim | null = null;
    try {
      claim = await input.kaneo.claim(input.kinds);
      failures = 0;
    } catch (error) {
      failures += 1;
      input.log(`Claim failed: ${(error as Error).message}`);
    }
    if (claim) {
      try {
        await input.handle(claim);
      } catch (error) {
        input.log(`Run ${claim.run.id} crashed: ${(error as Error).message}`);
      }
      continue;
    }
    const delay = failures
      ? Math.min(input.intervalMs * 2 ** failures, MAX_BACKOFF_MS)
      : input.intervalMs;
    await sleep(delay, undefined, { signal: input.shutdown }).catch(() => {});
  }
}
