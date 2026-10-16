import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { GanttSpan } from "./gantt-dependencies";

export type GanttDependencyDialogMove = {
  taskId: string;
  title: string;
  from: GanttSpan;
  to: GanttSpan;
};

type GanttDependencyDialogContent = {
  brokenCount: number;
  // The tasks block each other in a loop, so there is no order to move them
  // into.
  cycle: boolean;
  moves: readonly GanttDependencyDialogMove[];
};

type GanttDependencyDialogProps = GanttDependencyDialogContent & {
  open: boolean;
  onMoveRelated: () => void;
  onMoveOnly: () => void;
  onCancel: () => void;
};

const range = (span: GanttSpan) =>
  `${format(span.start, "MMM d")} – ${format(span.end, "MMM d, yyyy")}`;

// Asks what to do when moving or resizing a bar breaks a "blocks"
// dependency: move the related tasks along (keeping them in order), keep
// only this change, or undo it.
export function GanttDependencyDialog({
  open,
  brokenCount,
  cycle,
  moves,
  onMoveRelated,
  onMoveOnly,
  onCancel,
}: GanttDependencyDialogProps) {
  const { t } = useTranslation();
  // The list below is focusable (so it scrolls by keyboard), which would
  // otherwise take the initial focus from the safe choice.
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Once the question is answered the route has nothing left to show, so
  // the dialog keeps what it last showed while it animates closed.
  const [shown, setShown] = useState<GanttDependencyDialogContent>({
    brokenCount,
    cycle,
    moves,
  });
  if (
    open &&
    (shown.brokenCount !== brokenCount ||
      shown.cycle !== cycle ||
      shown.moves !== moves)
  ) {
    setShown({ brokenCount, cycle, moves });
  }
  const content = open ? { brokenCount, cycle, moves } : shown;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("tasks:gantt.dependencies.title", {
              count: content.brokenCount,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {content.cycle
              ? t("tasks:gantt.dependencies.cycleDescription")
              : t("tasks:gantt.dependencies.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {content.moves.length > 0 && (
          <div
            role="region"
            aria-label={t("tasks:gantt.dependencies.movesLabel")}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a long chain scrolls, and only a focusable region scrolls by keyboard in every browser
            tabIndex={0}
            className="mx-6 mb-4 max-h-64 overflow-y-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ul className="space-y-2 text-sm">
              {content.moves.map((move) => (
                <li key={move.taskId} className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {move.title}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="sr-only">
                      {t("tasks:gantt.dependencies.moveDates", {
                        from: range(move.from),
                        to: range(move.to),
                      })}
                    </span>
                    <span aria-hidden="true" className="line-through">
                      {range(move.from)}
                    </span>
                    <ArrowRight aria-hidden="true" className="size-3" />
                    <span aria-hidden="true" className="text-foreground">
                      {range(move.to)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AlertDialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMoveOnly}
          >
            {t("tasks:gantt.dependencies.moveOnly")}
          </Button>
          {content.moves.length > 0 && (
            <Button type="button" size="sm" onClick={onMoveRelated}>
              {t("tasks:gantt.dependencies.moveRelated", {
                count: content.moves.length,
              })}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
