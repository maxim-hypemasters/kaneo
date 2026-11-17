import { cn } from "@/lib/cn";

type NestedDetailsProps = {
  /** Shown in order; empty ones are left out. */
  values: (string | null)[];
  className?: string;
};

// The muted line of details after a nested milestone or task.
export function NestedDetails({ values, className }: NestedDetailsProps) {
  const shown = values.filter((value): value is string => Boolean(value));
  if (shown.length === 0) return null;
  return (
    <span className={cn("text-muted-foreground text-xs", className)}>
      {shown.join(" · ")}
    </span>
  );
}
