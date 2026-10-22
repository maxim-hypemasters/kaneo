import { cn } from "@/lib/cn";

type GanttResizeHandleProps = {
  edge: "start" | "end";
  label: string;
  disabled: boolean;
  // On a feature's summary bar the handle is a lighter strip over the end of
  // the dark band, shown on hover and focus (always on touch screens).
  summary: boolean;
  tone?: "default" | "destructive";
  onPointerDown: (event: React.PointerEvent) => void;
};

export function GanttResizeHandle({
  edge,
  label,
  disabled,
  summary,
  tone = "default",
  onPointerDown,
}: GanttResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      className={cn(
        "relative z-20 shrink-0 cursor-ew-resize touch-none",
        "min-h-[44px] w-6 sm:min-h-0 sm:w-2",
        summary
          ? "group/handle focus-visible:outline-hidden"
          : cn(
              tone === "destructive"
                ? "border-destructive/15 bg-destructive/8 hover:bg-destructive/18"
                : "border-primary/15 bg-primary/8 hover:bg-primary/18",
              edge === "start" ? "border-r" : "border-l",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            ),
      )}
    >
      {summary && !disabled ? (
        // As tall as the summary band (h-6) and centred like it; lit while
        // the pointer is anywhere on the bar (its `group/bar`).
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 transition-colors motion-reduce:transition-none",
            "group-hover/bar:bg-primary-foreground/20 group-hover/handle:bg-primary-foreground/35 group-focus-visible/handle:bg-primary-foreground/40 pointer-coarse:bg-primary-foreground/20",
            edge === "start" ? "rounded-tl-[3px]" : "rounded-tr-[3px]",
          )}
        />
      ) : null}
    </button>
  );
}
