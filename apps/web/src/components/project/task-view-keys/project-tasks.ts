import type { ProjectWithTasks } from "@/types/project";

// Every task the board holds: in columns, planned, archived and in Triage.
export function projectTasks(project: ProjectWithTasks | undefined) {
  if (!project) return [];
  return [
    ...project.columns.flatMap((column) => column.tasks),
    ...project.plannedTasks,
    ...project.archivedTasks,
    ...(project.triageTasks ?? []),
  ];
}
