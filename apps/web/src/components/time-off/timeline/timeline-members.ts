export type TimelineMember = {
  userId: string;
  name: string;
  image: string | null;
};

type WorkspaceMember = {
  userId: string;
  user?: { name?: string | null; image?: string | null } | null;
};

// One row per member, the viewer first and then by name. A member listed
// twice shows once.
export function timelineMembers(
  members: readonly WorkspaceMember[],
  viewerId: string | undefined,
  locale?: string,
): TimelineMember[] {
  const byId = new Map<string, TimelineMember>();
  for (const member of members) {
    if (byId.has(member.userId)) continue;
    byId.set(member.userId, {
      userId: member.userId,
      name: member.user?.name?.trim() ?? "",
      image: member.user?.image ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.userId === viewerId) return -1;
    if (b.userId === viewerId) return 1;
    return a.name.localeCompare(b.name, locale, { sensitivity: "base" });
  });
}
