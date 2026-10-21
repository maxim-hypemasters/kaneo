type ScheduledLeaf = {
  type: string;
  status?: string | null;
  archivedAt?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
};

export function deriveMilestoneDates(
  tasks: readonly ScheduledLeaf[],
  timeZone: string,
): { startDate: string | null; endDate: string | null } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayOf = (value: string | null | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = formatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`;
  };
  let startDate: string | null = null;
  let endDate: string | null = null;
  for (const task of tasks) {
    if (
      (task.type !== "task" && task.type !== "bug") ||
      task.status === "archived" ||
      task.archivedAt
    )
      continue;
    const start = dayOf(task.startDate);
    const end = dayOf(task.dueDate);
    for (const day of [start, end]) {
      if (!day) continue;
      if (startDate === null || day < startDate) startDate = day;
      if (endDate === null || day > endDate) endDate = day;
    }
  }
  return { startDate, endDate };
}
