import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

type GanttFeatureBarLabelProps = {
  title: string;
  // The done/total count of the feature's tasks, e.g. "3/5"; null when it
  // has none.
  progress: string | null;
  // A short phone bar draws its title after itself instead, so the band
  // keeps just the icon.
  textOutside: boolean;
};

// What a feature's summary bar shows on its dark band. The bar's button is
// named by its aria-label, so the count here is visual only.
export function GanttFeatureBarLabel({
  title,
  progress,
  textOutside,
}: GanttFeatureBarLabelProps) {
  return (
    <span className="relative z-10 flex min-w-0 items-center gap-1.5 text-xs leading-none text-primary-foreground">
      <Layers aria-hidden="true" className="size-3.5 shrink-0" />
      <span
        className={cn(
          "min-w-0 truncate font-semibold leading-tight",
          textOutside && "sr-only",
        )}
      >
        {title}
      </span>
      {progress && !textOutside ? (
        <span
          aria-hidden="true"
          className="shrink-0 font-medium tabular-nums text-primary-foreground/70"
        >
          {progress}
        </span>
      ) : null}
    </span>
  );
}
