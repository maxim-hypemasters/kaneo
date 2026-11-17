type AwayEntry = {
  userId: string;
  startDate: string;
  endDate: string;
  // Only the viewer's own entries, or every entry for approvers, carry a
  // status. Entries without one are approved time off of other members.
  status?: string;
};

const DAY_MS = 86_400_000;

// The latest first day that still continues a stretch ending on `endDate`:
// the next day, or the Monday after when the stretch ends on a Friday or
// Saturday. Works on YYYY-MM-DD strings in UTC, so time zones never shift it.
function continuesUntil(endDate: string) {
  const next = new Date(Date.parse(endDate) + DAY_MS);
  const weekday = next.getUTCDay();
  const skip = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  return new Date(next.getTime() + skip * DAY_MS).toISOString().slice(0, 10);
}

// For each member away on `today` (YYYY-MM-DD), the last day of that
// stretch. Approved entries that touch, overlap or are only a weekend apart
// count as one stretch. Pending, declined and cancelled entries are ignored.
export function awayUntilByUser(
  entries: readonly AwayEntry[],
  today: string,
): Map<string, string> {
  const byUser = new Map<string, AwayEntry[]>();
  for (const entry of entries) {
    if (entry.status !== undefined && entry.status !== "approved") continue;
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }

  const awayUntil = new Map<string, string>();
  for (const [userId, list] of byUser) {
    const sorted = [...list].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    let until: string | null = null;
    for (const entry of sorted) {
      if (until === null) {
        if (entry.startDate <= today && entry.endDate >= today) {
          until = entry.endDate;
        }
      } else if (entry.startDate <= continuesUntil(until)) {
        if (entry.endDate > until) until = entry.endDate;
      } else {
        break;
      }
    }
    if (until !== null) awayUntil.set(userId, until);
  }
  return awayUntil;
}
