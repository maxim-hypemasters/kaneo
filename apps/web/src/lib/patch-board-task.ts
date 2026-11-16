import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { TRIAGE_STATUS } from "@/lib/triage/triage-status";

/** Preserve board-only metadata while applying a bounded task refresh. */
export function patchBoardTask(
  board: ProjectWithTasks,
  taskId: string,
  update?: Partial<Task>,
) {
  let patch = update;
  if (patch && "description" in patch) {
    const deferred =
      new TextEncoder().encode(patch.description ?? "").byteLength > 64 * 1024;
    patch = {
      ...patch,
      description: deferred ? null : patch.description,
      descriptionDeferred: patch.descriptionDeferred ?? deferred,
    };
  }
  const existing = [
    ...board.columns.flatMap((column) => column.tasks),
    ...board.plannedTasks,
    ...board.archivedTasks,
    ...(board.triageTasks ?? []),
  ].find((task) => task.id === taskId);
  const belongs = patch && patch.projectId === board.id;
  const task =
    belongs && patch
      ? ({
          ...existing,
          ...patch,
          assigneeId:
            "userId" in patch
              ? (patch.userId ?? null)
              : (existing?.assigneeId ?? null),
        } as Task)
      : undefined;
  const columns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.id !== taskId),
  }));
  const plannedTasks = board.plannedTasks.filter((task) => task.id !== taskId);
  const archivedTasks = board.archivedTasks.filter(
    (task) => task.id !== taskId,
  );
  const triageTasks = (board.triageTasks ?? []).filter(
    (task) => task.id !== taskId,
  );
  if (task && task.type !== "feature") {
    const target =
      task.status === "planned"
        ? plannedTasks
        : task.status === "archived"
          ? archivedTasks
          : task.status === TRIAGE_STATUS
            ? triageTasks
            : (columns.find((column) => column.slug === task.status)?.tasks ??
              (typeof task.status === "string" ? plannedTasks : undefined));
    if (!target) return null;
    target.push(task);
    target.sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  }
  return { ...board, columns, plannedTasks, archivedTasks, triageTasks };
}
