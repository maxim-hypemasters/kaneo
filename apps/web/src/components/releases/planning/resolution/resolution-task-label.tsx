import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import type { ReleasePlanTask } from "@/types/release-plan";

export function ResolutionTaskLabel({
  task,
  href,
  onOpenTask,
}: {
  task: ReleasePlanTask;
  href?: string;
  onOpenTask?: (taskId: string) => void;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 text-sm">
      <TaskTypeGlyph
        type={task.type}
        decorative
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      {task.identifier &&
        (href ? (
          <a
            href={href}
            data-task-id={task.taskId}
            className="pointer-events-auto relative z-10 rounded-sm text-xs leading-5 text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              if (
                !onOpenTask ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onOpenTask(task.taskId);
            }}
          >
            {task.identifier}
          </a>
        ) : (
          <span className="text-xs leading-5 text-muted-foreground">
            {task.identifier}
          </span>
        ))}
      <span className="min-w-0 break-words font-medium" title={task.title}>
        {task.title}
      </span>
    </span>
  );
}
