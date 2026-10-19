export type MilestoneProgress = {
  total: number;
  started: number;
  completed: number;
};
type Column = { id: string; slug: string; position: number; isFinal: boolean };

export function milestoneProgress(
  statuses: readonly { status: string; count: number }[],
  columns: readonly Column[],
): MilestoneProgress {
  const ordered = [...columns].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const first = ordered.find((column) => !column.isFinal);
  const completed = new Set(
    ordered.filter((column) => column.isFinal).map((column) => column.slug),
  );
  const started = new Set(
    ordered
      .filter((column) => column.id !== first?.id)
      .map((column) => column.slug),
  );
  const result = { total: 0, started: 0, completed: 0 };
  for (const { status, count } of statuses) {
    result.total += count;
    if (completed.has(status)) {
      result.completed += count;
      result.started += count;
    } else if (
      status !== "planned" &&
      status !== "archived" &&
      started.has(status)
    ) {
      result.started += count;
    }
  }
  return result;
}
