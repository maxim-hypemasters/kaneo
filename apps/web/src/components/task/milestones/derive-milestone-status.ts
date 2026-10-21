type WorkflowColumn = {
  id: string;
  slug: string;
  position: number;
  isFinal: boolean;
};
type LinkedLeaf = {
  type: string;
  status?: string | null;
  archivedAt?: string | null;
};

export function deriveMilestoneStatus(
  tasks: readonly LinkedLeaf[],
  columns: readonly WorkflowColumn[],
): "to-do" | "in-progress" | "done" {
  const visible = tasks.filter(
    (task) =>
      (task.type === "task" || task.type === "bug") &&
      task.status !== "archived" &&
      !task.archivedAt,
  );
  const ordered = [...columns].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
  const done = new Set(
    ordered.filter((column) => column.isFinal).map((column) => column.slug),
  );
  if (
    visible.length > 0 &&
    visible.every((task) => task.status && done.has(task.status))
  )
    return "done";
  const active = new Set(
    ordered
      .filter((column) => !column.isFinal)
      .slice(1)
      .map((column) => column.slug),
  );
  return visible.some(
    (task) =>
      task.status &&
      (done.has(task.status) ||
        (task.status !== "planned" &&
          task.status !== "backlog" &&
          active.has(task.status))),
  )
    ? "in-progress"
    : "to-do";
}
