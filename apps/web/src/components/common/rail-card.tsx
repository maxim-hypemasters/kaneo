import { type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

export const railCardClassName =
  "rounded-xl border border-border/70 bg-muted/40 p-1.5";

type RailCardProps = {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// A titled card for a page's side rail, such as a project's Teams or a task's
// Properties.
export function RailCard({
  title,
  count,
  action,
  className,
  children,
}: RailCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(railCardClassName, className)}
    >
      <div
        className={cn(
          "flex h-7 items-center justify-between gap-2 px-2",
          action ? "pr-1" : null,
        )}
      >
        <h2
          id={headingId}
          className="truncate font-medium text-muted-foreground text-xs uppercase tracking-wide"
        >
          {title}
        </h2>
        {count || action ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {count ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {count}
              </span>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
