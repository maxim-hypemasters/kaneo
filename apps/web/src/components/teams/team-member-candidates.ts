type WorkspaceMember = {
  userId: string;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

export type TeamMemberCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

// Workspace members who aren't in the team yet, by name.
export function teamMemberCandidates(
  members: readonly WorkspaceMember[],
  teamMemberIds: readonly string[],
): TeamMemberCandidate[] {
  const skip = new Set(teamMemberIds);
  const candidates: TeamMemberCandidate[] = [];
  for (const member of members) {
    if (skip.has(member.userId)) continue;
    skip.add(member.userId);
    candidates.push({
      id: member.userId,
      name: member.user?.name ?? null,
      email: member.user?.email ?? null,
      image: member.user?.image ?? null,
    });
  }
  return candidates.sort((a, b) =>
    (a.name || a.email || "").localeCompare(b.name || b.email || ""),
  );
}
