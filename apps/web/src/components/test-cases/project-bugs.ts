import type { ProjectWithTasks } from "@/types/project";

// The project's open and planned Bugs, by number, for linking.
export function projectBugs(project: ProjectWithTasks | undefined) {
  if (!project) return [];
  return [
    ...project.columns.flatMap((column) => column.tasks),
    ...project.plannedTasks,
  ]
    .filter((task) => task.type === "bug")
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}
