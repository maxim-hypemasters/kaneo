import { Meter } from "@/components/ui/meter";
import { cn } from "@/lib/cn";
import { filledSegments, type ReadinessTone } from "./readiness-display";

const SEGMENTS = 10;
const SEGMENT_KEYS = Array.from({ length: SEGMENTS }, (_, index) => index);

const FILL_CLASSES: Record<ReadinessTone, string> = {
  error: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
};

type ReadinessMeterProps = {
  score: number | null;
  tone: ReadinessTone | null;
  label: string;
  dimmed?: boolean;
};

export function ReadinessMeter({
  score,
  tone,
  label,
  dimmed = false,
}: ReadinessMeterProps) {
  const filled = score === null ? 0 : filledSegments(score, SEGMENTS);
  const className = cn("flex w-full flex-row gap-0.5", dimmed && "opacity-50");
  const segments = SEGMENT_KEYS.map((index) => (
    <span
      key={index}
      aria-hidden="true"
      className={cn(
        "h-1.5 flex-1 rounded-full transition-colors duration-300",
        index < filled && tone ? FILL_CLASSES[tone] : "bg-input",
      )}
    />
  ));

  // Without a score a meter would read as 0%; the card's title says it was
  // not checked yet.
  if (score === null) {
    return (
      <div aria-hidden="true" className={className}>
        {segments}
      </div>
    );
  }

  return (
    <Meter value={score} aria-label={label} className={className}>
      {segments}
    </Meter>
  );
}
