import type { Project, TaskDetail } from "../api/schemas.js";
import type { ResolvedTask } from "../tasks/resolve-task.js";

const project: Project = {
  id: "p1",
  workspaceId: "ws_1",
  slug: "kan",
  name: "Kaneo Web",
  icon: null,
  description: null,
  archivedAt: null,
  position: 0,
  lastTaskNumber: 20,
};

// A loaded task, KAN-<number>, for tests that need one.
export function resolvedTaskFixture(
  number: number,
  task: Partial<TaskDetail> = {},
  projectOverrides: Partial<Project> = {},
): ResolvedTask {
  const id = task.id ?? `t${number}`;
  const taskProject = { ...project, ...projectOverrides };
  return {
    task: {
      id,
      projectId: taskProject.id,
      number,
      title: `Task ${number}`,
      description: null,
      status: "to-do",
      priority: "no-priority",
      startDate: null,
      dueDate: null,
      createdAt: "2026-10-08T10:00:00.000Z",
      assigneeId: null,
      assigneeName: null,
      type: "task",
      featureId: null,
      releaseId: null,
      ...task,
    },
    workspaceId: taskProject.workspaceId,
    project: taskProject,
    columns: [],
    ticketId: `${taskProject.slug.toUpperCase()}-${number}`,
    url: `https://kaneo.test/task/${id}`,
  };
}
