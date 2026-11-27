import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import {
  AGENT_RUN_EVENT_KINDS,
  AGENT_RUN_STATUSES,
  READINESS_VERDICTS,
  SUGGESTED_PRIORITIES,
  SUGGESTION_KINDS,
  WORK_RUN_KINDS,
} from "./agent-types";
import { SHIP_BLOCKERS } from "./compute-ship-blockers";
import {
  START_BLOCKERS,
  START_PULL_REQUEST_RESULTS,
  START_PULL_REQUEST_STATES,
} from "./compute-start-blockers";

const person = z.object({ id: z.string(), name: z.string() }).nullable();
const named = z.object({ id: z.string(), name: z.string() });
const titled = z.object({ id: z.string(), title: z.string() });
const reason = z.string().openapi({
  description: "Why the agent picked this value; may be empty",
});

export const agentSuggestionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("description"),
      id: z.string(),
      title: z.string(),
      markdown: z.string().openapi({
        description: "Markdown that Apply appends to the description",
      }),
    }),
    z.object({
      kind: z.literal("assignee"),
      id: z.string(),
      reason,
      user: named,
    }),
    z.object({
      kind: z.literal("priority"),
      id: z.string(),
      reason,
      priority: z.enum(SUGGESTED_PRIORITIES),
    }),
    z.object({
      kind: z.literal("feature"),
      id: z.string(),
      reason,
      feature: titled,
      milestone: titled.nullable().openapi({
        description: "A milestone of that feature, set together with it",
      }),
    }),
    z.object({
      kind: z.literal("milestone"),
      id: z.string(),
      reason,
      milestone: titled,
    }),
    z.object({
      kind: z.literal("release"),
      id: z.string(),
      reason,
      release: z.object({
        id: z.string(),
        name: z.string(),
        submissionDate: z.string(),
      }),
    }),
    z.object({
      kind: z.literal("estimate"),
      id: z.string(),
      reason,
      minutes: z.number().int().openapi({ description: "Working effort" }),
      keepsDates: z.boolean().openapi({
        description:
          "The task already has a start or due date, which Apply keeps",
      }),
      plan: z
        .object({
          assignee: named,
          suggestedAssignee: z.boolean().openapi({
            description:
              "The dates are for the suggested assignee, whom Apply assigns first",
          }),
          startDate: responseTimestamp,
          dueDate: responseTimestamp,
        })
        .nullable()
        .openapi({
          description:
            "The start and due dates Apply sets, planned around the person's time off and other dated work; null when only the estimate is set",
        }),
    }),
    z.object({
      kind: z.literal("test_cases"),
      id: z.string(),
      reason,
      target: z.enum(["bug", "milestone"]).openapi({
        description:
          "Apply creates the test cases linked to the bug, or to the task's milestone",
      }),
      milestone: titled.nullable(),
      cases: z.array(
        z.object({
          title: z.string(),
          steps: z.string().nullable(),
          expectedResult: z.string().nullable(),
        }),
      ),
    }),
  ])
  .openapi("AgentSuggestion");

export type AgentSuggestion = z.infer<typeof agentSuggestionSchema>;

export const agentAssessmentSchema = z
  .object({
    score: z.number().int(),
    verdict: z.enum(READINESS_VERDICTS),
    questions: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        options: z.array(z.string()),
        blocking: z.boolean(),
      }),
    ),
    suggestions: z.array(agentSuggestionSchema).openapi({
      description:
        "Additions to the description, and values for the task's empty fields. Only those that still fit the task and that the caller can read are listed.",
    }),
    assessedAt: responseTimestamp,
  })
  .openapi("AgentAssessment");

export const agentRunSchema = z
  .object({
    id: z.string(),
    kind: z.enum(WORK_RUN_KINDS).openapi({
      description:
        "ship: the agent implements the task; start: Kaneo opens a draft pull request, no model involved",
    }),
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
    workflow: z
      .object({
        todoStatus: z.string().nullable().openapi({
          description:
            "The status work waits in; Start and Ship move the task only from here",
        }),
        inProgress: z
          .object({ slug: z.string(), name: z.string() })
          .nullable()
          .openapi({ description: "Where Start and Ship move the task" }),
      })
      .openapi({
        description:
          "The project's To Do and In Progress columns, found by slug or else by column order",
      }),
    start: z.object({
      canStart: z.boolean(),
      blockers: z.array(z.enum(START_BLOCKERS)),
      pullRequest: z.enum(START_PULL_REQUEST_STATES).openapi({
        description:
          "opens: Start also opens a draft pull request; otherwise it only moves the task, for the reason given",
      }),
    }),
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
    canPush: z.boolean().openapi({
      description:
        "The runner reported GitHub write credentials, so Start can open draft pull requests",
    }),
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

export const startTaskResultSchema = z
  .object({
    moved: z.boolean().openapi({
      description: "The task moved from To Do to In Progress",
    }),
    status: z.string().nullable().openapi({
      description: "The task's status afterwards",
    }),
    pullRequest: z.enum(START_PULL_REQUEST_RESULTS).openapi({
      description:
        "queued: the runner will open a draft pull request; otherwise why none is opened",
    }),
  })
  .openapi("AgentStartResult");

export const taskAgentPromptSchema = z
  .object({
    prompt: z.string().openapi({
      description:
        "Instructions for a coding agent of your choice, with the task, its decisions and comments",
    }),
    branchName: z.string(),
  })
  .openapi("TaskAgentPrompt");

export const okSchema = z.object({ ok: z.literal(true) });

export const appliedSuggestionSchema = z
  .object({
    ok: z.literal(true),
    kind: z.enum(SUGGESTION_KINDS),
    assigneeChanged: z.boolean().openapi({
      description: "Apply also assigned the task, as an estimate may",
    }),
    datesChanged: z.boolean().openapi({
      description: "Apply also set the task's start and due dates",
    }),
  })
  .openapi("AgentSuggestionApplied");
