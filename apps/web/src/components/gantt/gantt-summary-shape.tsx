import { cn } from "@/lib/cn";

type GanttSummaryShapeProps = {
  // Ends that run past the visible range are drawn flat, without a tip.
  clippedStart: boolean;
  clippedEnd: boolean;
  // Places and sizes the band inside its positioned parent, plus any state
  // styles (hover, focus, lifted).
  className?: string;
};

// The classic Gantt summary bar a feature is drawn as: a solid band with a
// small downward bracket tip under each end. Purely visual. The tips inherit
// the band's background, so hover styles on the band reach them too. Forced
// colours (High Contrast) drop backgrounds, so there the band is outlined and
// the tips keep a solid system text colour.
export function GanttSummaryShape({
  clippedStart,
  clippedEnd,
  className,
}: GanttSummaryShapeProps) {
  return (
    <span
      aria-hidden="true"
      data-gantt-summary-shape=""
      className={cn(
        "pointer-events-none absolute bg-primary transition-[background-color,box-shadow] motion-reduce:transition-none forced-colors:border forced-colors:border-[CanvasText]",
        !clippedStart && "rounded-tl-[3px]",
        !clippedEnd && "rounded-tr-[3px]",
        className,
      )}
    >
      {clippedStart ? null : (
        <span
          data-gantt-summary-tip="start"
          className="absolute top-full left-0 size-1.5 bg-inherit forced-color-adjust-none forced-colors:bg-[CanvasText] [clip-path:polygon(0_0,100%_0,0_100%)]"
        />
      )}
      {clippedEnd ? null : (
        <span
          data-gantt-summary-tip="end"
          className="absolute top-full right-0 size-1.5 bg-inherit forced-color-adjust-none forced-colors:bg-[CanvasText] [clip-path:polygon(0_0,100%_0,100%_100%)]"
        />
      )}
    </span>
  );
}
