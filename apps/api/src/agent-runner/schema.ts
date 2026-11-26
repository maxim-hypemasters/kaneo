import { AGENT_RUN_EVENT_KINDS, AGENT_RUN_KINDS } from "../agent/agent-types";
import { runnerQuestionsSchema } from "../agent/assessment-schema";
import { z } from "../openapi";

export const RUN_FAILURE_CODES = [
  "needs_input",
  "no_changes",
  "agent_failed",
  "timeout",
  "git_failed",
  "cancelled",
  "internal",
] as const;

export const runIdParam = z.object({
  runId: z
    .string()
    .min(1)
    .openapi({ param: { name: "runId", in: "path" } }),
});

// Optional to the validator so a missing header gets the same 409 as a
// superseded attempt, not a 400.
export const runAttemptHeaders = z.object({
  "x-kaneo-run-attempt": z
    .string()
    .optional()
    .openapi({
      param: { name: "x-kaneo-run-attempt", in: "header", required: true },
      description:
        "The `run.attempt` from the claim. A missing or malformed value, or one a later claim has superseded, gets 409 AI_AGENT_RUN_NOT_RUNNING.",
      example: "1",
    }),
});

export const claimBody = z
  .object({
    kinds: z.array(z.enum(AGENT_RUN_KINDS)).min(1),
    runnerVersion: z.string().trim().max(40).optional(),
  })
  .openapi("AgentRunnerClaimInput");

export const runEventsBody = z
  .object({
    events: z
      .array(
        z.object({
          kind: z.enum(AGENT_RUN_EVENT_KINDS),
          message: z.string().min(1).max(2000),
        }),
      )
      .min(1)
      .max(20),
  })
  .openapi("AgentRunEventsInput");

export const shipResultBody = z
  .object({
    prUrl: z
      .string()
      .url()
      .max(500)
      .refine((url) => url.startsWith("https://"), "Use an https URL"),
    branch: z.string().trim().min(1).max(250),
    summary: z.string().trim().max(8000),
  })
  .openapi("AgentShipResultInput");

export const runFailureBody = z
  .object({
    code: z.enum(RUN_FAILURE_CODES),
    message: z.string().trim().max(2000),
    questions: runnerQuestionsSchema.optional(),
  })
  .openapi("AgentRunFailureInput");
