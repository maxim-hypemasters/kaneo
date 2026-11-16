// Mirrors the API: triage members decide; with nobody on the list,
// project:update holders can still clear waiting work.
export function canTriage({
  userId,
  memberIds,
  canUpdateProjects,
}: {
  userId: string | null | undefined;
  memberIds: readonly string[] | undefined;
  canUpdateProjects: boolean;
}) {
  if (!userId || !memberIds) return false;
  if (memberIds.includes(userId)) return true;
  return memberIds.length === 0 && canUpdateProjects;
}

// New Tasks and Bugs from someone outside the list wait in Triage.
export function routesToTriage(
  userId: string | null | undefined,
  memberIds: readonly string[] | undefined,
) {
  return !!memberIds?.length && !!userId && !memberIds.includes(userId);
}
