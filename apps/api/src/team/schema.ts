import { z } from "../openapi";

export const teamParam = z.object({ id: z.string() });

export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const teamNameBody = z.object({
  name: z.string().trim().min(1).max(64).openapi({
    description:
      "Team name, unique within the workspace regardless of letter case.",
  }),
});

export const teamMembersBody = z.object({
  userIds: z.array(z.string()).max(500).openapi({
    description:
      "The full list of members. Each must be a workspace member; people left out are removed from the team.",
  }),
});

export const teamProjectsBody = z.object({
  projectIds: z.array(z.string()).max(500).openapi({
    description:
      "The full list of linked projects. Links to projects you can't access are kept even when left out.",
  }),
});
