export type GanttStatusPhase = "todo" | "active" | "done";

type Column = { slug: string; isFinal: boolean };

const NOT_STARTED = new Set(["backlog", "planned", "to-do", "todo"]);

// Where a Task/Bug stands, for its bar's look. Workflows are custom, so the
// columns decide: final columns are done, the first column (and the usual
// not-started names) is to do, and everything between is in progress.
export function ganttStatusPhase(
  status: string,
  columns: readonly Column[] | undefined,
): GanttStatusPhase {
  if (columns?.some((column) => column.isFinal && column.slug === status))
    return "done";
  if (NOT_STARTED.has(status) || columns?.[0]?.slug === status) return "todo";
  return "active";
}
