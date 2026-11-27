import type { AgentRunKind, RunClaim } from "../kaneo/client";
import type { RunDeps } from "../run-deps";

export type RunHandler = (deps: RunDeps, claim: RunClaim) => Promise<void>;
export type RunHandlers = Partial<Record<AgentRunKind, RunHandler>>;

/**
 * Hands a claimed run to the handler for its kind, as Kaneo states it. A
 * slot passes only the handlers for the kinds it claims, so a run of any
 * other kind, one this runner doesn't know included, fails rather than
 * running with that slot's isolation.
 */
export async function dispatchRun(
  handlers: RunHandlers,
  deps: RunDeps,
  claim: RunClaim,
) {
  const kind: string = claim.run.kind;
  const handle = Object.hasOwn(handlers, kind)
    ? handlers[kind as AgentRunKind]
    : undefined;
  if (handle) {
    deps.log(`${kind} ${claim.run.id} for ${claim.context.task.ticketId}`);
    await handle(deps, claim);
    return;
  }
  deps.log(`Run ${claim.run.id} is a ${kind} run, which this slot can't take`);
  await deps.kaneo.fail(claim.run, {
    code: "internal",
    message: `This runner can't take ${kind} runs`,
  });
}
