import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { cn } from "@/lib/cn";
import type Task from "@/types/task";
import { stopCardEvents } from "./stop-card-events";
import { SubtaskProgressGlyph } from "./subtask-progress-glyph";
import { SubtasksHoverList } from "./subtasks-hover-list";
import { taskChipClass } from "./task-chip-class";

type SubtasksChipProps = {
  task: Task;
  className?: string;
};

// A feature's task progress; its hover list shows the feature's tasks.
export function SubtasksChip({ task, className }: SubtasksChipProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const counts = task.subtaskCounts;
  if (!counts?.total) return null;

  const openTask = (taskId: string) => {
    setOpen(false);
    navigate({ to: ".", search: { taskId } });
  };

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={200}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={t("tasks:subtasks.progress", {
            completed: counts.completed,
            total: counts.total,
          })}
          className={cn(taskChipClass, "tabular-nums", className)}
          {...stopCardEvents}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <SubtaskProgressGlyph
            completed={counts.completed}
            total={counts.total}
          />
          {counts.completed}/{counts.total}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="w-auto p-0"
        {...stopCardEvents}
      >
        {open && (
          <SubtasksHoverList
            featureId={task.id}
            projectId={task.projectId}
            onOpenTask={openTask}
          />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
