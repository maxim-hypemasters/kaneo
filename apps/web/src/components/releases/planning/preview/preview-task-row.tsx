import { useTranslation } from "react-i18next";
import { Diamond, Layers } from "lucide-react";
import type { GanttTimeline } from "@/components/gantt/timeline";
import { remToPx } from "@/components/gantt/gantt-scroll";
import { cn } from "@/lib/cn";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { previewBarColumns, type PreviewWork } from "./preview-model";

const MIN_INLINE_LABEL_PX = 120;

export function PreviewTaskRow({
  task,
  timeline,
  dayWidthRem,
  focused = false,
}: {
  task: PreviewWork;
  timeline: GanttTimeline;
  dayWidthRem: number;
  focused?: boolean;
}) {
  const { t } = useTranslation();
  const span = previewBarColumns(task, timeline);
  const barLabel = [
    task.identifier,
    task.title,
    task.milestoneTitle,
    task.featureTitle,
    task.completed && t("tasks:releases.planning.previewChart.completed"),
  ]
    .filter(Boolean)
    .join("; ");
  const barWidth = (span.lineEnd - span.lineStart) * dayWidthRem;
  const showInlineLabel = remToPx(barWidth) >= MIN_INLINE_LABEL_PX;
  const inlineLabel = showInlineLabel ? task.title : task.identifier;
  return (
    <div
      data-gantt-row={task.taskId}
      data-gantt-focused={focused || undefined}
      className={cn(
        "relative min-h-14 border-b border-border/70",
        focused && "bg-accent/50 ring-2 ring-inset ring-ring",
      )}
    >
      {span.barInView && (
        <Popover>
          <PopoverTrigger
            render={<button type="button" />}
            aria-label={barLabel}
            data-gantt-preview-bar={task.taskId}
            className={cn(
              "absolute inset-y-1 z-[2] flex cursor-pointer items-center overflow-hidden rounded-md border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              task.type === "bug"
                ? "border-destructive/35 bg-[color-mix(in_oklab,var(--destructive)_14%,var(--background))]"
                : "border-primary/25 bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))]",
              task.completed && "bg-background",
            )}
            style={{
              left: `${(span.lineStart - 1) * dayWidthRem}rem`,
              width: `${barWidth}rem`,
            }}
          >
            {inlineLabel && (
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-medium",
                  showInlineLabel ? "px-2 text-xs" : "px-1 text-[10px]",
                  task.completed && "text-muted-foreground line-through",
                )}
              >
                {inlineLabel}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-80 max-w-[calc(100vw-2rem)]"
            align="start"
          >
            <div className="flex flex-col gap-2 p-3">
              <PopoverTitle className="break-words text-sm">
                {task.title}
              </PopoverTitle>
              {task.milestoneTitle && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Diamond
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="min-w-0 break-words">
                    {task.milestoneTitle}
                  </span>
                </p>
              )}
              {task.featureTitle && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Layers
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="min-w-0 break-words">
                    {task.featureTitle}
                  </span>
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
