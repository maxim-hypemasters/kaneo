import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type GanttLaneGroupProps = {
  laneKey: string;
  // The id of the lane's name in its header.
  labelId: string;
  // A bar dragged from another lane would land here.
  dropTarget: boolean;
  children: ReactNode;
};

// One lane of the grouped chart, header and rows: what a bar dragged between
// lanes is dropped on (bars find it by its data-gantt-lane attribute).
export function GanttLaneGroup({
  laneKey,
  labelId,
  dropTarget,
  children,
}: GanttLaneGroupProps) {
  return (
    // No z-index/transform here: a lane must not form a stacking context, or
    // a bar dragged out of it would paint underneath the other lanes.
    <div
      role="group"
      aria-labelledby={labelId}
      data-gantt-lane={laneKey}
      data-drop-target={dropTarget ? "" : undefined}
      className={cn(
        "relative",
        dropTarget &&
          "after:pointer-events-none after:absolute after:inset-0 after:z-[12] after:bg-primary/5 after:ring-2 after:ring-inset after:ring-primary/50",
      )}
    >
      {children}
    </div>
  );
}
