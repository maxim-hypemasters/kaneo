import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { TriageEmptyState } from "./triage-empty-state";
import { TriageTaskRow } from "./triage-task-row";

type TriageListViewProps = {
  project: ProjectWithTasks;
  tasks: Task[];
  canTriage: boolean;
  triageEnabled: boolean;
  canManage: boolean;
};

export default function TriageListView({
  project,
  tasks,
  canTriage,
  triageEnabled,
  canManage,
}: TriageListViewProps) {
  const { data: workspace } = useActiveWorkspace();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(
    workspace?.id ?? "",
  );

  if (tasks.length === 0)
    return (
      <TriageEmptyState
        projectId={project.id}
        triageEnabled={triageEnabled}
        canManage={canManage}
      />
    );

  return (
    <ul className="h-full overflow-y-auto">
      {tasks.map((task) => (
        <TriageTaskRow
          key={task.id}
          task={task}
          projectSlug={project.slug}
          workspaceId={workspace?.id ?? project.workspaceId}
          members={workspaceUsers?.members}
          canTriage={canTriage}
        />
      ))}
    </ul>
  );
}
