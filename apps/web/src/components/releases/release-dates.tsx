import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates as ReleaseDateValues } from "@/types/release";
import {
  RELEASE_DATE_KIND_ORDER,
  RELEASE_DATE_KINDS,
} from "./release-date-kinds";

type ReleaseDatesProps = {
  release: ReleaseDateValues;
  today: string;
  // Hidden labels stay for screen readers and show in a tooltip on hover; the
  // icons tell the dates apart on screen.
  labels?: "visible" | "hidden";
  className?: string;
  // For each date, e.g. to lift it above a link that covers its row so the
  // pointer reaches its tooltip.
  itemClassName?: string;
};

export function ReleaseDates({
  release,
  today,
  labels = "hidden",
  className,
  itemClassName,
}: ReleaseDatesProps) {
  const { t } = useTranslation();

  return (
    <dl
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs",
        className,
      )}
    >
      {RELEASE_DATE_KIND_ORDER.map((kind) => {
        const style = RELEASE_DATE_KINDS[kind];
        const Icon = style.icon;
        const label = t(style.labelKey);
        const item = (
          <>
            <dt className="flex items-center gap-1">
              <Icon
                aria-hidden="true"
                className={cn("size-3.5 shrink-0", style.iconClassName)}
              />
              <span className={labels === "hidden" ? "sr-only" : undefined}>
                {label}
              </span>
            </dt>
            <dd className="whitespace-nowrap text-foreground/85 tabular-nums">
              {formatReleaseDate(release[style.field], { today })}
            </dd>
          </>
        );
        const itemClass = cn("flex items-center gap-1", itemClassName);

        if (labels === "visible") {
          return (
            <div key={kind} className={itemClass}>
              {item}
            </div>
          );
        }
        return (
          <Tooltip key={kind}>
            <TooltipTrigger render={<div className={itemClass} />}>
              {item}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </dl>
  );
}
