import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

export function scopeTasks(
  project: ProjectWithTasks | null | undefined,
  scope: "board" | "backlog" | "schedule" | "triage",
): Task[] {
  if (!project) return [];
  const boardTasks = project.columns.flatMap((column) => column.tasks);
  if (scope === "board") return boardTasks;
  if (scope === "triage") return project.triageTasks ?? [];
  if (scope === "backlog") {
    return [...(project.plannedTasks ?? []), ...(project.archivedTasks ?? [])];
  }
  return [...boardTasks, ...(project.plannedTasks ?? [])];
}
