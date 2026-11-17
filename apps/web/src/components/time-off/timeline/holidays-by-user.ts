type DatedHoliday = { userId: string; date: string };

// Each member's calendar holidays in date order, for their timeline row.
export function holidaysByUser<T extends DatedHoliday>(
  holidays: readonly T[],
): Map<string, T[]> {
  const byUser = new Map<string, T[]>();
  for (const holiday of holidays) {
    const list = byUser.get(holiday.userId);
    if (list) list.push(holiday);
    else byUser.set(holiday.userId, [holiday]);
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byUser;
}
