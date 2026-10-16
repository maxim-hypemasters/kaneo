import { z } from "../openapi";

const relationType = z.enum(["subtask", "blocks", "related"]).openapi({
  description:
    "`subtask` is deprecated: creating one puts the target into the source's feature (making the source a feature if it's a plain task). Use PUT /task/feature/{id} instead.",
});

export const taskIdParam = z.object({ taskId: z.string() });

export const projectIdParam = z.object({ projectId: z.string() });

export const taskRelationParam = z.object({ id: z.string() });

export const projectTaskRelationsQuery = z.object({
  relationType: relationType.optional().openapi({
    description: "Only return relations of this type. Omit for every type.",
  }),
});

export const createTaskRelationBody = z.object({
  sourceTaskId: z.string(),
  targetTaskId: z.string(),
  relationType,
});
