import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { sectionIdClass, sectionRowClass } from "./section-row-class";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import type { TaskType } from "@/types/task";

type TaskReferenceRowProps = ComponentProps<"div"> & {
  status: ReactNode;
  displayId: string | null;
  title: string;
  itemType?: TaskType;
  done: boolean;
  onOpen: () => void;
  tag?: ReactNode;
  assignee: ReactNode;
};

export function TaskReferenceRow({
  status,
  displayId,
  title,
  itemType,
  done,
  onOpen,
  tag,
  assignee,
  className,
  ...props
}: TaskReferenceRowProps) {
  return (
    <div
      className={cn(sectionRowClass, "cursor-default", className)}
      {...props}
    >
      {status}
      <span className={sectionIdClass}>{displayId}</span>
      {itemType === "bug" && (
        <TaskTypeGlyph
          type="bug"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 text-left text-[13px] outline-none focus-visible:underline max-sm:line-clamp-2 sm:truncate",
          done
            ? "text-muted-foreground line-through"
            : "text-foreground/85 group-hover:text-foreground",
        )}
      >
        {title}
      </button>
      {tag}
      {assignee}
    </div>
  );
}
