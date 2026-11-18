import { responseTimestamp, z } from "../openapi";

export const teamMemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  })
  .openapi("TeamMember");

export const teamProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    icon: z.string().nullable(),
  })
  .openapi("TeamProject");

export const teamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    workspaceId: z.string(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
    members: z.array(teamMemberSchema),
    projects: z.array(teamProjectSchema).openapi({
      description:
        "Linked projects. Members of the team can open them even when their own project access is limited. Only projects the viewer can access are listed.",
    }),
  })
  .openapi("Team");

export const teamListSchema = z.array(teamSchema);

export const deletedTeamSchema = z
  .object({ id: z.string() })
  .openapi("DeletedTeam");
