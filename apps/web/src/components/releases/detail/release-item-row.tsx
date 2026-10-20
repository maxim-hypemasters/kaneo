import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import type Task from "@/types/task";
import { ReleaseTaskLink } from "./release-task-link";

export type ReleaseItemColumn = { name: string; icon?: string | null };

type ReleaseItemRowProps = {
  task: Task;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  // The task's column, or undefined for a planned task.
  column: ReleaseItemColumn | undefined;
  done: boolean;
  nested?: boolean;
};

// A task in the release; opens its sheet. Done ones are struck through and
// dimmed, and the column name says where each one is.
export function ReleaseItemRow({
  task,
  workspaceId,
  releaseId,
  projectSlug,
  column,
  done,
  nested = false,
}: ReleaseItemRowProps) {
  const { t } = useTranslation();
  const statusName = column?.name ?? t("tasks:status.planned");

  return (
    <li>
      <ReleaseTaskLink
        workspaceId={workspaceId}
        projectId={task.projectId}
        releaseId={releaseId}
        taskId={task.id}
        className={cn(
          "flex h-11 min-w-0 items-center sm:h-10 gap-3 border-border/50 border-b px-4 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          nested && "pl-10 sm:pl-12",
        )}
      >
        <span aria-hidden="true" className="shrink-0">
          {getColumnIcon(task.status, done, column?.icon)}
        </span>
        {projectSlug && task.number !== null ? (
          <span className="w-14 shrink-0 truncate font-mono text-muted-foreground text-xs">
            {projectSlug}-{task.number}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.type === "bug" && (
            <TaskTypeGlyph
              type="bug"
              className="mr-1 inline-block size-3.5 shrink-0 align-text-bottom text-muted-foreground"
            />
          )}
          {task.title}
        </span>
        <span className="max-w-32 shrink-0 truncate text-muted-foreground text-xs">
          {statusName}
        </span>
      </ReleaseTaskLink>
    </li>
  );
}
