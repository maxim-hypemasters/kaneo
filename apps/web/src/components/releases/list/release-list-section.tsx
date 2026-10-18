import { ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

type ReleaseListSectionProps = {
  title: string;
  count: number;
  // Collapsible sections pass whether they're open.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export function ReleaseListSection({
  title,
  count,
  open = true,
  onOpenChange,
  children,
}: ReleaseListSectionProps) {
  const headingId = useId();
  const listId = useId();
  const label = (
    <>
      <span>{title}</span>
      <span className="font-normal text-muted-foreground tabular-nums">
        {count}
      </span>
    </>
  );

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="sticky top-0 z-20 flex h-9 items-center border-border/60 border-b bg-muted/60 px-4 font-medium text-foreground text-xs backdrop-blur"
      >
        {onOpenChange ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => onOpenChange(!open)}
            className="touch-hitbox relative -mx-1 flex items-center gap-2 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                open && "rotate-90",
              )}
            />
            {label}
          </button>
        ) : (
          <span className="flex items-center gap-2">{label}</span>
        )}
      </h2>
      {open ? <ul id={listId}>{children}</ul> : null}
    </section>
  );
}
