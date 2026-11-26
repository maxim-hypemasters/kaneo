import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import {
  AGENT_RUN_EVENT_KINDS,
  AGENT_RUN_STATUSES,
  CHECKLIST_STATUSES,
  READINESS_VERDICTS,
} from "./agent-types";
import { SHIP_BLOCKERS } from "./compute-ship-blockers";

const person = z.object({ id: z.string(), name: z.string() }).nullable();

export const agentAssessmentSchema = z
  .object({
    score: z.number().int(),
    verdict: z.enum(READINESS_VERDICTS),
    summary: z.string(),
    checklist: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: z.enum(CHECKLIST_STATUSES),
        note: z.string().optional(),
      }),
    ),
    questions: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        options: z.array(z.string()),
        blocking: z.boolean(),
      }),
    ),
    suggestions: z.array(
      z.object({ id: z.string(), title: z.string(), markdown: z.string() }),
    ),
    assessedAt: responseTimestamp,
  })
  .openapi("AgentAssessment");

export const agentRunSchema = z
  .object({
    id: z.string(),
    status: z.enum(AGENT_RUN_STATUSES),
    requestedBy: person,
    cancelRequested: z.boolean(),
    result: z
      .object({ prUrl: z.string(), branch: z.string(), summary: z.string() })
      .nullable(),
    errorCode: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: responseTimestamp,
    startedAt: nullableResponseTimestamp,
    finishedAt: nullableResponseTimestamp,
  })
  .openapi("AgentRun");

export const agentRunEventSchema = z.object({
  id: z.number().int(),
  kind: z.enum(AGENT_RUN_EVENT_KINDS),
  message: z.string(),
  createdAt: responseTimestamp,
});

export const taskAgentSchema = z
  .object({
    enabled: z.boolean().openapi({
      description: "Whether the project turned the AI agent on",
    }),
    autoAssess: z.boolean().openapi({
      description:
        "Whether the project checks readiness on its own after edits; when false, checks run only on request",
    }),
    assessment: agentAssessmentSchema.nullable(),
    stale: z.boolean().openapi({
      description:
        "The task text or answers changed since the assessment was made",
    }),
    assessing: z.boolean(),
    assessScheduledAt: nullableResponseTimestamp.openapi({
      description:
        "When a check queued after recent edits will start; null when none is waiting or it may start now",
    }),
    lastAssessFailure: z
      .object({
        code: z.string().nullable(),
        message: z.string().nullable(),
        at: nullableResponseTimestamp,
        sameInput: z.boolean().openapi({
          description:
            "The task text and answers are unchanged since the failed check, so checking again automatically would likely fail the same way",
        }),
      })
      .nullable()
      .openapi({
        description:
          "Set when the most recent finished readiness check failed, for example because the runner's model key is wrong",
      }),
    clarifications: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
        answeredBy: person,
        createdAt: responseTimestamp,
      }),
    ),
    runner: z.object({ configured: z.boolean(), online: z.boolean() }),
    ship: z.object({
      canShip: z.boolean(),
      blockers: z.array(z.enum(SHIP_BLOCKERS)),
      repository: z.string().nullable(),
      baseBranch: z.string(),
      branchName: z.string(),
      activeRun: agentRunSchema.nullable(),
      lastRun: agentRunSchema.nullable(),
      events: z.array(agentRunEventSchema),
    }),
  })
  .openapi("TaskAgent");

export const projectAgentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    autoAssess: z.boolean(),
    repository: z.string().nullable(),
    suggestedRepository: z.string().nullable().openapi({
      description: "The repository of the project's GitHub integration",
    }),
    baseBranch: z.string(),
    instructions: z.string(),
    readyThreshold: z.number().int(),
    runnerConfigured: z.boolean(),
  })
  .openapi("ProjectAgentSettings");

export const agentRunnerStatusSchema = z
  .object({
    configured: z.boolean(),
    tokenPrefix: z.string().nullable(),
    online: z.boolean(),
    lastSeenAt: nullableResponseTimestamp,
    runnerVersion: z.string().nullable(),
    createdAt: nullableResponseTimestamp,
  })
  .openapi("AgentRunnerStatus");

export const agentRunnerTokenSchema = z
  .object({
    token: z.string().openapi({
      description: "Shown only once; Kaneo keeps a hash",
    }),
    status: agentRunnerStatusSchema,
  })
  .openapi("AgentRunnerToken");

export const okSchema = z.object({ ok: z.literal(true) });
