import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  projectTable,
  teamMemberTable,
  teamProjectTable,
  teamTable,
  userTable,
} from "../database/schema";
import type { DbOrTx } from "../project-access/db-or-tx";
import { projectAccessCondition } from "../project-access/project-access-condition";

export type TeamView = Awaited<ReturnType<typeof readTeams>>[number];

// Teams with their members and the linked projects the viewer can access.
export async function readTeams(
  database: DbOrTx,
  request: { workspaceId: string; viewerId: string; teamIds?: string[] },
) {
  const teams = await database
    .select({
      id: teamTable.id,
      name: teamTable.name,
      workspaceId: teamTable.workspaceId,
      createdAt: teamTable.createdAt,
      updatedAt: teamTable.updatedAt,
    })
    .from(teamTable)
    .where(
      and(
        eq(teamTable.workspaceId, request.workspaceId),
        request.teamIds ? inArray(teamTable.id, request.teamIds) : undefined,
      ),
    )
    .orderBy(sql`lower(${teamTable.name})`, asc(teamTable.id));
  if (teams.length === 0) return [];

  const teamIds = teams.map((team) => team.id);
  const [members, projects] = await Promise.all([
    database
      .select({
        teamId: teamMemberTable.teamId,
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      })
      .from(teamMemberTable)
      .innerJoin(userTable, eq(teamMemberTable.userId, userTable.id))
      .where(inArray(teamMemberTable.teamId, teamIds))
      .orderBy(sql`lower(${userTable.name})`, asc(userTable.id)),
    database
      .select({
        teamId: teamProjectTable.teamId,
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        icon: projectTable.icon,
      })
      .from(teamProjectTable)
      .innerJoin(projectTable, eq(teamProjectTable.projectId, projectTable.id))
      .where(
        and(
          inArray(teamProjectTable.teamId, teamIds),
          projectAccessCondition(request.viewerId, projectTable.id),
        ),
      )
      .orderBy(sql`lower(${projectTable.name})`, asc(projectTable.id)),
  ]);

  return teams.map((team) => ({
    ...team,
    members: members
      .filter((member) => member.teamId === team.id)
      .map(({ teamId: _, ...member }) => member),
    projects: projects
      .filter((project) => project.teamId === team.id)
      .map(({ teamId: _, ...project }) => project),
  }));
}
