import type { Team } from "@/fetchers/team/types";

// The teams whose members can open the project through the team.
export function teamsLinkedToProject(
  teams: readonly Team[],
  projectId: string,
): Team[] {
  return teams.filter((team) =>
    team.projects.some((project) => project.id === projectId),
  );
}
