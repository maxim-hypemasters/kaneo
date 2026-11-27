import { AGENT_RUN_KINDS, FIELD_SUGGESTION_KINDS } from "../agent/agent-types";
import { z } from "../openapi";

export const planningContextSchema = z
  .object({
    missing: z.array(z.enum(FIELD_SUGGESTION_KINDS)).openapi({
      description: "The fields the agent may recommend a value for",
    }),
    estimateDayMinutes: z.number().int().openapi({
      description: "Working minutes in one day of the project's estimates",
    }),
    people: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        openTasks: z.number().int(),
      }),
    ),
    features: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        milestones: z.array(z.object({ id: z.string(), title: z.string() })),
      }),
    ),
    releases: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        submissionDate: z.string(),
      }),
    ),
    testCaseTarget: z.enum(["bug", "milestone", "description"]).nullable(),
  })
  .openapi("AgentPlanningContext");

export type PlanningContext = z.infer<typeof planningContextSchema>;

export const runContextSchema = z
  .object({
    run: z.object({
      id: z.string(),
      kind: z.enum(AGENT_RUN_KINDS),
      attempt: z.number().int().openapi({
        description:
          "Send as X-Kaneo-Run-Attempt on every request about this run; a later claim of the same run supersedes it",
      }),
    }),
    context: z.object({
      task: z.object({
        id: z.string(),
        ticketId: z.string(),
        type: z.string(),
        title: z.string(),
        description: z.string(),
        priority: z.string().nullable(),
        status: z.string().nullable(),
        labels: z.array(z.string()),
        url: z.string(),
      }),
      comments: z.array(
        z.object({
          author: z.string(),
          content: z.string(),
          createdAt: z.string(),
        }),
      ),
      clarifications: z.array(
        z.object({ question: z.string(), answer: z.string() }),
      ),
      relatedTasks: z.array(
        z.object({
          ticketId: z.string(),
          title: z.string(),
          relation: z.string(),
        }),
      ),
      project: z.object({
        name: z.string(),
        repository: z.string().nullable(),
        baseBranch: z.string(),
        instructions: z.string(),
      }),
      branchName: z.string(),
      resultSchema: z.record(z.string(), z.unknown()).nullable().openapi({
        description:
          "For assess runs, the JSON Schema the assessment must match",
      }),
      planning: planningContextSchema.nullable().openapi({
        description:
          "For assess runs, the candidates for the task's empty fields; null otherwise",
      }),
    }),
  })
  .openapi("AgentRunClaim");

export const heartbeatSchema = z.object({ cancelRequested: z.boolean() });
