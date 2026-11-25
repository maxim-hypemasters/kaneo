import { responseTimestamp, z } from "../openapi";

export const projectLinkSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    url: z.string(),
    title: z.string(),
    position: z.number().int().openapi({
      description: "Sort key within the project; lower comes first.",
    }),
    createdAt: responseTimestamp,
  })
  .openapi("ProjectLink");

export const projectLinkListSchema = z.array(projectLinkSchema);

export const deletedProjectLinkSchema = z
  .object({ id: z.string() })
  .openapi("DeletedProjectLink");
