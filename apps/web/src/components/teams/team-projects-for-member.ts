import type { Team, TeamProject } from "@/fetchers/team/types";

export type TeamGrantedProject = { project: TeamProject; teamNames: string[] };

// Projects a member can open through their teams, each with the teams that
// grant it, by project name.
export function teamProjectsForMember(
  teams: readonly Team[],
  userId: string,
): TeamGrantedProject[] {
  const granted = new Map<string, TeamGrantedProject>();
  for (const team of teams) {
    if (!team.members.some((member) => member.id === userId)) continue;
    for (const project of team.projects) {
      const entry = granted.get(project.id) ?? { project, teamNames: [] };
      entry.teamNames.push(team.name);
      granted.set(project.id, entry);
    }
  }
  return [...granted.values()].sort((a, b) =>
    a.project.name.localeCompare(b.project.name),
  );
}
