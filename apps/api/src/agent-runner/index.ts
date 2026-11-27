import { assessmentResultSchema } from "../agent/assessment-schema";
import { requireAgentEnabled } from "../agent/middleware/require-agent-enabled";
import { okSchema } from "../agent/response";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { appendRunEvents } from "./controllers/append-run-events";
import { claimRun } from "./controllers/claim-run";
import { completeAssessment } from "./controllers/complete-assessment";
import { completeShip } from "./controllers/complete-ship";
import { failRun } from "./controllers/fail-run";
import { heartbeatRun } from "./controllers/heartbeat-run";
import type { RunnerRunRef } from "./controllers/load-runner-run";
import { requireRunnerToken } from "./middleware/require-runner-token";
import { heartbeatSchema, runContextSchema } from "./response";
import { parseRunAttempt } from "./run-attempt";
import {
  claimBody,
  runAttemptHeaders,
  runEventsBody,
  runFailureBody,
  runIdParam,
  shipResultBody,
} from "./schema";

// Mounted before user authentication: these routes accept only a workspace
// runner token, sent as `Authorization: Bearer kar_...`.
const tags = ["AI agent runner"];
const security = [{ runnerToken: [] }];
const runner = [requireAgentEnabled, requireRunnerToken] as const;
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});
const authErrors = {
  401: errorResponse("AI_AGENT_RUNNER_UNAUTHORIZED"),
  404: errorResponse("AI_AGENT_DISABLED on this instance"),
};
const runErrors = {
  ...authErrors,
  404: errorResponse("AI_AGENT_RUN_NOT_FOUND, or AI_AGENT_DISABLED"),
  409: errorResponse(
    "AI_AGENT_RUN_NOT_RUNNING when the run was cancelled or expired, or another claim superseded this attempt",
  ),
};
const ok = { 200: jsonResponse("Recorded", okSchema) };

type Variables = BaseVariables & { runnerWorkspaceId: string };

const runRef = (
  { runId }: { runId: string },
  headers: { "x-kaneo-run-attempt"?: string },
  workspaceId: string,
): RunnerRunRef => ({
  runId,
  workspaceId,
  attempt: parseRunAttempt(headers["x-kaneo-run-attempt"]),
});

const agentRunner = apiRouter<Variables>()
  .openapi(
    createRoute({
      method: "post",
      operationId: "claimAgentRun",
      path: "/claim",
      tags,
      security,
      summary: "Claim the next agent run",
      description:
        "Takes the next due run of the given kinds in the runner's workspace, with the task context it needs. 204 when there is nothing to do. The runner must heartbeat while it works, and send `run.attempt` as X-Kaneo-Run-Attempt on every request about the run.",
      middleware: [...runner],
      request: { body: json(claimBody) },
      responses: {
        200: jsonResponse("A claimed run and its context", runContextSchema),
        204: { description: "No run is due" },
        400: errorResponse("Invalid body"),
        ...authErrors,
      },
    }),
    async (c) => {
      const { kinds, runnerVersion, canPush } = c.req.valid("json");
      const claimed = await claimRun(c.get("runnerWorkspaceId"), kinds, {
        runnerVersion,
        canPush: canPush ?? false,
      });
      if (!claimed) return c.body(null, 204);
      return c.json(claimed, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "heartbeatAgentRun",
      path: "/runs/{runId}/heartbeat",
      tags,
      security,
      summary: "Keep a run claimed",
      middleware: [...runner],
      request: { params: runIdParam, headers: runAttemptHeaders },
      responses: {
        200: jsonResponse("Whether to stop", heartbeatSchema),
        ...runErrors,
      },
    }),
    async (c) =>
      c.json(
        await heartbeatRun(
          runRef(
            c.req.valid("param"),
            c.req.valid("header"),
            c.get("runnerWorkspaceId"),
          ),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "appendAgentRunEvents",
      path: "/runs/{runId}/events",
      tags,
      security,
      summary: "Report run progress",
      middleware: [...runner],
      request: {
        params: runIdParam,
        headers: runAttemptHeaders,
        body: json(runEventsBody),
      },
      responses: { ...ok, 400: errorResponse("Invalid body"), ...runErrors },
    }),
    async (c) => {
      await appendRunEvents(
        runRef(
          c.req.valid("param"),
          c.req.valid("header"),
          c.get("runnerWorkspaceId"),
        ),
        c.req.valid("json").events,
      );
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "completeAgentAssessment",
      path: "/runs/{runId}/assessment",
      tags,
      security,
      summary: "Report an assessment",
      description:
        "Finishes an assess run. A 400 lists the validation issues so the runner can ask the model to correct its answer.",
      middleware: [...runner],
      request: {
        params: runIdParam,
        headers: runAttemptHeaders,
        body: json(assessmentResultSchema),
      },
      responses: {
        ...ok,
        400: errorResponse("The assessment does not match the schema"),
        ...runErrors,
      },
    }),
    async (c) => {
      await completeAssessment(
        runRef(
          c.req.valid("param"),
          c.req.valid("header"),
          c.get("runnerWorkspaceId"),
        ),
        c.req.valid("json"),
      );
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "completeAgentShip",
      path: "/runs/{runId}/ship-result",
      tags,
      security,
      summary: "Report an opened pull request",
      description:
        "Finishes a ship run, or a start run that opened a draft pull request.",
      middleware: [...runner],
      request: {
        params: runIdParam,
        headers: runAttemptHeaders,
        body: json(shipResultBody),
      },
      responses: { ...ok, 400: errorResponse("Invalid body"), ...runErrors },
    }),
    async (c) => {
      await completeShip(
        runRef(
          c.req.valid("param"),
          c.req.valid("header"),
          c.get("runnerWorkspaceId"),
        ),
        c.req.valid("json"),
      );
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "failAgentRun",
      path: "/runs/{runId}/fail",
      tags,
      security,
      summary: "Report a run that could not finish",
      description:
        "Ends the run. Questions sent with it are added to the task's open questions.",
      middleware: [...runner],
      request: {
        params: runIdParam,
        headers: runAttemptHeaders,
        body: json(runFailureBody),
      },
      responses: { ...ok, 400: errorResponse("Invalid body"), ...runErrors },
    }),
    async (c) => {
      await failRun(
        runRef(
          c.req.valid("param"),
          c.req.valid("header"),
          c.get("runnerWorkspaceId"),
        ),
        c.req.valid("json"),
      );
      return c.json({ ok: true as const }, 200);
    },
  );

export default agentRunner;
