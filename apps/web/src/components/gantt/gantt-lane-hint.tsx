import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const OFFSET_PX = 12;
// Matches max-w-60 plus a small margin, and the chip's rough height: near the
// right/bottom edge the chip flips to the other side of the pointer instead
// of being cut off.
const MAX_WIDTH_PX = 248;
const MAX_HEIGHT_PX = 40;

type GanttLaneHintProps = {
  x: number;
  y: number;
  label: string;
  disabled: boolean;
};

// Follows the pointer while a bar is dragged over another lane, saying what
// dropping there will do. Purely visual: the drop itself is announced by the
// moved row (and by an error toast if it fails).
export function GanttLaneHint({ x, y, label, disabled }: GanttLaneHintProps) {
  const flipX = x + OFFSET_PX + MAX_WIDTH_PX > window.innerWidth;
  const flipY = y + OFFSET_PX + MAX_HEIGHT_PX > window.innerHeight;

  return createPortal(
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed z-50 max-w-60 truncate rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-md",
        disabled
          ? "border-border text-muted-foreground"
          : "border-primary/30 text-foreground",
      )}
      style={{
        left: flipX ? undefined : x + OFFSET_PX,
        right: flipX ? window.innerWidth - x + OFFSET_PX : undefined,
        top: flipY ? undefined : y + OFFSET_PX,
        bottom: flipY ? window.innerHeight - y + OFFSET_PX : undefined,
      }}
    >
      {label}
    </div>,
    document.body,
  );
}
