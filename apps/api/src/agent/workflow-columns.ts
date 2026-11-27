import { TRIAGE_STATUS } from "../triage/triage-status";

export type WorkflowColumn = {
  id: string;
  slug: string;
  name: string;
  position: number;
  isFinal: boolean;
};

export type WorkflowPosition = { slug: string; name: string };

export type WorkflowColumns = {
  todo: WorkflowPosition | null;
  inProgress: WorkflowPosition | null;
};

const VIRTUAL = new Set(["planned", "archived", TRIAGE_STATUS]);

const position = (column: WorkflowColumn): WorkflowPosition => ({
  slug: column.slug,
  name: column.name,
});

/**
 * Where work waits and where it starts. Columns carry no type, so To Do is
 * the `to-do` slug or else the first open column (the new-task rule), and In
 * Progress is the `in-progress` slug or else the next open column after To
 * Do (the milestone progress rule).
 */
export function resolveWorkflowColumns(
  columns: readonly WorkflowColumn[],
): WorkflowColumns {
  const ordered = [...columns].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const slugCounts = new Map<string, number>();
  for (const column of ordered)
    slugCounts.set(column.slug, (slugCounts.get(column.slug) ?? 0) + 1);
  const open = ordered.filter(
    (column) =>
      !column.isFinal &&
      !VIRTUAL.has(column.slug) &&
      slugCounts.get(column.slug) === 1,
  );

  const todo = open.find((column) => column.slug === "to-do") ?? open[0];
  if (!todo) return { todo: null, inProgress: null };
  const inProgress =
    open.find((column) => column.slug === "in-progress" && column !== todo) ??
    open
      .slice(open.indexOf(todo) + 1)
      .find((column) => column.slug !== "backlog");
  return {
    todo: position(todo),
    inProgress: inProgress ? position(inProgress) : null,
  };
}
