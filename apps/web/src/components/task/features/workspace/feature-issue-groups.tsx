import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import type { FeatureIssuesPage } from "@/fetchers/feature/get-feature-issues";
import { getColumnIcon } from "@/lib/column";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import type Task from "@/types/task";
import SubtaskRow from "../../subtask-row";
import type { FeatureIssueTask } from "./feature-issue-task";

export function FeatureIssueGroups({
  groups,
  tasks,
  selected,
  canEdit,
  workspaceId,
  projectId,
  onSelect,
  onComplete,
  onOpen,
  onDelete,
  onRemove,
}: {
  groups: FeatureIssuesPage["groups"];
  tasks: FeatureIssueTask[];
  selected: ReadonlyMap<string, Task>;
  canEdit: boolean;
  workspaceId: string;
  projectId: string;
  onSelect: (task: Task, checked: boolean) => void;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
  onRemove: (task: Task) => void;
}) {
  const { t } = useTranslation();
  return groups.map((group) => {
    const members = tasks.filter((task) => task.status === group.slug);
    if (!members.length) return null;
    return (
      <section key={group.id} className="min-w-0 space-y-1">
        <h3 className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-2 text-xs font-medium">
          {getColumnIcon(group.slug, group.isFinal)}
          <span>{getStatusDisplayLabel(group.slug, group.name)}</span>
          <span className="text-muted-foreground tabular-nums">
            {group.total}
          </span>
        </h3>
        {members.map((task) => (
          <div key={task.id} className="flex min-w-0 items-center gap-1">
            <Checkbox
              className="shrink-0"
              checked={selected.has(task.id)}
              aria-label={t("tasks:features.workspace.issues.selectAria", {
                title: task.title,
              })}
              onCheckedChange={(checked) => onSelect(task, checked)}
            />
            <div className="min-w-0 flex-1">
              <SubtaskRow
                task={task}
                tasks={selected.has(task.id) ? [...selected.values()] : [task]}
                displayId={
                  task.number === null
                    ? null
                    : `${task.projectSlug}-${task.number}`
                }
                projectId={projectId}
                workspaceId={workspaceId}
                isSelected={selected.has(task.id)}
                isFocused={false}
                isCompleted={group.isFinal}
                canEdit={canEdit}
                selectionRadius="rounded-md"
                assignee={
                  task.userId
                    ? {
                        user: {
                          name: task.assigneeName,
                          image: task.assigneeImage,
                        },
                      }
                    : null
                }
                onToggleComplete={() => onComplete(task)}
                onNavigate={() => onOpen(task)}
                onDeleteClick={() => onDelete(task)}
                onRemoveFromFeature={() => onRemove(task)}
              />
            </div>
          </div>
        ))}
      </section>
    );
  });
}
