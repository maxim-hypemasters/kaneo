import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import CircularProgress from "@/components/ui/circular-progress";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { useCachedBoard } from "@/hooks/queries/task/use-cached-board";

type SubtasksHoverListProps = {
  featureId: string;
  projectId: string;
  onOpenTask: (taskId: string) => void;
};

// The feature's tasks from the cached board: a feature and its tasks share a
// project, so no request of its own.
export function SubtasksHoverList({
  featureId,
  projectId,
  onOpenTask,
}: SubtasksHoverListProps) {
  const { t } = useTranslation();
  const board = useCachedBoard(projectId, (board) => board);
  const tasks = getFeatureIndex(board).tasksByFeature.get(featureId) ?? [];
  const columns = new Map(
    (board?.columns ?? []).map((column) => [column.slug, column]),
  );
  const rows = tasks.map((task) => {
    const column = columns.get(task.status);
    return { task, column, isCompleted: column?.isFinal ?? false };
  });
  const completed = rows.filter((row) => row.isCompleted).length;

  return (
    <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col">
      <div className="flex h-9 items-center gap-2 border-border border-b px-3">
        <CircularProgress completed={completed} total={rows.length} size={14} />
        <span className="font-medium text-[13px] text-foreground">
          {t("tasks:subtasks.title")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {t("tasks:subtasks.progress", { completed, total: rows.length })}
        </span>
      </div>
      <div className="flex flex-col p-1">
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-muted-foreground text-xs">
            {/* The board's first load isn't cached until it completes. */}
            {board ? t("tasks:subtasks.empty") : t("common:empty.loading")}
          </p>
        ) : (
          rows.map(({ task, column, isCompleted }) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task.id)}
              className="flex h-8.5 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5">
                {getColumnIcon(task.status, isCompleted, column?.icon)}
              </span>
              <span className="w-13 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                {board?.slug}-{task.number}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  isCompleted
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
              >
                {task.title}
              </span>
              <AssigneeAvatar
                name={task.assigneeName}
                image={task.assigneeImage}
                assigned={Boolean(task.userId)}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
