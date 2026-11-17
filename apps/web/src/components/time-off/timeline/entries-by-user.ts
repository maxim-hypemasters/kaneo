type DatedEntry = { userId: string; startDate: string };

// Each member's entries in date order, for one timeline row per member.
export function entriesByUser<T extends DatedEntry>(
  entries: readonly T[],
): Map<string, T[]> {
  const byUser = new Map<string, T[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  return byUser;
}
