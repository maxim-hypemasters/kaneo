import { cn } from "@/lib/cn";

type GanttResizeHandleProps = {
  edge: "start" | "end";
  label: string;
  // Hover and focus tint, in the bar's own colour.
  className: string;
  onPointerDown: (event: React.PointerEvent) => void;
  // Moves the edge by whole days, for the arrow keys.
  onNudge: (days: number) => void;
};

// A thin strip over one end of a task bar: drag it, or use the arrow keys,
// to change that date. It lies over the bar's padding, so it takes no room
// from the title.
export function GanttResizeHandle({
  edge,
  label,
  className,
  onPointerDown,
  onNudge,
}: GanttResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-gantt-resize={edge}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onNudge(event.key === "ArrowLeft" ? -1 : 1);
      }}
      className={cn(
        "absolute inset-y-0 z-20 w-2 cursor-ew-resize touch-none transition-colors motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        edge === "start" ? "left-0" : "right-0",
        className,
      )}
    />
  );
}
