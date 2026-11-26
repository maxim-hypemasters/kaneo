import { z } from "../openapi";

export const taskIdParam = z.object({
  taskId: z
    .string()
    .min(1)
    .openapi({ param: { name: "taskId", in: "path" } }),
});

export const suggestionParam = taskIdParam.extend({
  suggestionId: z
    .string()
    .min(1)
    .openapi({ param: { name: "suggestionId", in: "path" } }),
});

export const projectIdParam = z.object({
  projectId: z
    .string()
    .min(1)
    .openapi({ param: { name: "projectId", in: "path" } }),
});

export const workspaceIdParam = z.object({
  workspaceId: z
    .string()
    .min(1)
    .openapi({ param: { name: "workspaceId", in: "path" } }),
});

export const submitAnswersBody = z
  .object({
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1),
          answer: z.string().trim().min(1).max(2000),
        }),
      )
      .min(1)
      .max(8),
  })
  .openapi("AgentAnswersInput");

// owner/name, as GitHub spells repositories.
const repository = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/name")
  .max(200);

// Refuses names git would reject or read as an option.
const branch = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/, "Invalid branch name");

export const projectAgentSettingsBody = z
  .object({
    enabled: z.boolean(),
    autoAssess: z.boolean(),
    repository: repository.nullable(),
    baseBranch: branch,
    instructions: z.string().max(4000),
    readyThreshold: z.number().int().min(1).max(100),
  })
  .openapi("ProjectAgentSettingsInput");
