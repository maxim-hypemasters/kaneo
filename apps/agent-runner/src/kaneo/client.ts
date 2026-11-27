import type { AgentRunnerAppType } from "@kaneo/api";
import { hc, type InferResponseType } from "hono/client";
import { RUNNER_VERSION } from "../version";

export class KaneoError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Kaneo answered ${status}: ${body.slice(0, 300)}`);
  }
}

function createHonoClient(
  apiUrl: string,
  token: string,
  fetch?: typeof globalThis.fetch,
) {
  return hc<AgentRunnerAppType>(apiUrl, {
    headers: { authorization: `Bearer ${token}` },
    fetch,
  });
}

type Hono = ReturnType<typeof createHonoClient>;
export type RunClaim = InferResponseType<
  Hono["agent-runner"]["claim"]["$post"],
  200
>;
export type RunContext = RunClaim["context"];
export type AgentRunKind = RunClaim["run"]["kind"];
// The claim a run-scoped request speaks for.
export type RunRef = Pick<RunClaim["run"], "id" | "attempt">;
export type ProgressEvent = { kind: "step" | "tool" | "log"; message: string };
export type QuestionInput = {
  text: string;
  options: string[];
  blocking: boolean;
};
export type FailureCode =
  | "needs_input"
  | "no_changes"
  | "agent_failed"
  | "timeout"
  | "git_failed"
  | "cancelled"
  | "internal";

type AnyResponse = { ok: boolean; status: number; text(): Promise<string> };

async function ok<T extends AnyResponse>(response: T): Promise<T> {
  if (response.ok) return response;
  throw new KaneoError(response.status, await response.text());
}

/**
 * The runner's side of /api/agent-runner. Every request about a run names
 * the claim's attempt, so Kaneo refuses one a later claim superseded. Every
 * claim says whether the runner can push, which decides whether Kaneo queues
 * start runs at all.
 */
export function createKaneoClient(
  apiUrl: string,
  token: string,
  options: { canPush: boolean; fetch?: typeof globalThis.fetch },
) {
  const runner = createHonoClient(apiUrl, token, options.fetch)["agent-runner"];
  const run = runner.runs[":runId"];
  const scope = (ref: RunRef) => ({
    param: { runId: ref.id },
    header: { "x-kaneo-run-attempt": String(ref.attempt) },
  });

  return {
    async claim(kinds: AgentRunKind[]): Promise<RunClaim | null> {
      const response = await ok(
        await runner.claim.$post({
          json: {
            kinds,
            runnerVersion: RUNNER_VERSION,
            canPush: options.canPush,
          },
        }),
      );
      if (response.status === 204) return null;
      return (await response.json()) as RunClaim;
    },
    async heartbeat(ref: RunRef): Promise<{ cancelRequested: boolean }> {
      const response = await ok(await run.heartbeat.$post(scope(ref)));
      return (await response.json()) as { cancelRequested: boolean };
    },
    async events(ref: RunRef, events: ProgressEvent[]) {
      await ok(await run.events.$post({ ...scope(ref), json: { events } }));
    },
    /** Returns the validation error text on a 400 so the model can fix it. */
    async assessment(ref: RunRef, result: unknown): Promise<string | null> {
      const response = await run.assessment.$post({
        ...scope(ref),
        json: result as never,
      });
      if (response.status === 400) return response.text();
      await ok(response);
      return null;
    },
    async shipResult(
      ref: RunRef,
      result: { prUrl: string; branch: string; summary: string },
    ) {
      await ok(await run["ship-result"].$post({ ...scope(ref), json: result }));
    },
    async fail(
      ref: RunRef,
      failure: {
        code: FailureCode;
        message: string;
        questions?: QuestionInput[];
      },
    ) {
      await ok(await run.fail.$post({ ...scope(ref), json: failure }));
    },
  };
}

export type KaneoClient = ReturnType<typeof createKaneoClient>;
