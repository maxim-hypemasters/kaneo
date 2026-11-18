import type { Team } from "@/fetchers/team/types";

// Swaps in the saved team so the card updates before the refetch lands.
export function replaceTeamInList(
  teams: readonly Team[] | undefined,
  saved: Team,
): Team[] | undefined {
  if (!teams) return teams;
  return teams.map((team) => (team.id === saved.id ? saved : team));
}
