import { responseTimestamp, z } from "../openapi";

const relationTypeDescription =
  "How the two tasks relate: `subtask`, `blocks`, or `related`.";

const relatedTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    isCompleted: z.boolean().openapi({
      description: "Whether the task is in a final column of its own project.",
    }),
    priority: z.string().nullable(),
    number: z.number().nullable(),
    projectId: z.string(),
    userId: z.string().nullable(),
    assigneeName: z.string().nullable(),
  })
  .openapi("RelatedTask");

export const taskRelationSchema = z
  .object({
    id: z.string(),
    sourceTaskId: z.string(),
    targetTaskId: z.string(),
    relationType: z.string().openapi({ description: relationTypeDescription }),
    createdAt: responseTimestamp,
  })
  .openapi("TaskRelation");

export const projectTaskRelationSchema = z
  .object({
    id: z.string(),
    sourceTaskId: z.string().openapi({
      description:
        "The blocking task for `blocks`, the parent task for `subtask`.",
    }),
    targetTaskId: z.string().openapi({
      description: "The blocked task for `blocks`, the subtask for `subtask`.",
    }),
    relationType: z.string().openapi({ description: relationTypeDescription }),
  })
  .openapi("ProjectTaskRelation");

export const projectTaskRelationListSchema = z.array(projectTaskRelationSchema);

// Always present in practice: relations whose endpoints are not both visible in
// the workspace are dropped. Nullable only because the lookup is a map read.
export const taskRelationWithTasksSchema = taskRelationSchema
  .extend({
    sourceTask: relatedTaskSchema.nullable(),
    targetTask: relatedTaskSchema.nullable(),
  })
  .openapi("TaskRelationWithTasks");

export const taskRelationWithTasksListSchema = z.array(
  taskRelationWithTasksSchema,
);
