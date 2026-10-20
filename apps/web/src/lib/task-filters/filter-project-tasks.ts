import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

export function filterProjectTasks(
  project: ProjectWithTasks,
  keep: (task: Task) => boolean,
): ProjectWithTasks {
  return {
    ...project,
    columns: (project.columns ?? []).map((column) => ({
      ...column,
      tasks: column.tasks.filter(
        (task) => task.type !== "feature" && keep(task),
      ),
    })),
    plannedTasks: (project.plannedTasks ?? []).filter(
      (task) => task.type !== "feature" && keep(task),
    ),
    archivedTasks: (project.archivedTasks ?? []).filter(
      (task) => task.type !== "feature" && keep(task),
    ),
  };
}
