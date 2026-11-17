import { TreePalm } from "lucide-react";
import { cn } from "@/lib/cn";

type AwayBadgeProps = {
  // "Away until Nov 20". Also the hover title.
  label: string;
  className?: string;
  // Hidden from screen readers where the same text is already visible next
  // to the name, such as a picker hint.
  decorative?: boolean;
};

// A small palm tree dot that marks a member who is away today.
export function AwayBadge({ label, className, decorative }: AwayBadgeProps) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      title={label}
      data-slot="away-badge"
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center rounded-full bg-info text-white ring-2 ring-background",
        className,
      )}
    >
      <TreePalm aria-hidden="true" className="size-[70%]!" />
    </span>
  );
}
