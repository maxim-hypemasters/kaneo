import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type GanttLaneToggleProps = {
  labelId: string;
  name: string;
  count: number;
  // Drawn before the name, e.g. the assignee's avatar.
  icon?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  // In the rail the toggle fills the header's height; without it, it sits
  // in a compact chip over the timeline.
  inRail: boolean;
  className?: string;
};

const labelClassName =
  "flex min-w-0 items-center gap-2 text-left text-xs font-medium text-foreground";

// A lane's name and task count. With tasks it's the button that collapses
// the lane; an empty lane has nothing to collapse, so it's plain text.
export function GanttLaneToggle({
  labelId,
  name,
  count,
  icon,
  collapsed,
  onToggle,
  inRail,
  className,
}: GanttLaneToggleProps) {
  const { t } = useTranslation();
  const countId = `${labelId}-count`;
  const hasTasks = count > 0;

  const label = (
    <>
      {hasTasks && (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
            !collapsed && "rotate-90",
          )}
        />
      )}
      {icon}
      <span id={labelId} className="min-w-0 truncate">
        {name}
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
      >
        {count}
      </span>
      <span id={countId} className="sr-only">
        {t("tasks:gantt.laneTaskCount", { count })}
      </span>
    </>
  );

  return hasTasks ? (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-labelledby={`${labelId} ${countId}`}
      onClick={onToggle}
      className={cn(
        labelClassName,
        "touch-hitbox relative touch-manipulation rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // In the rail the whole header height toggles, not just the label.
        inRail ? "w-full self-stretch" : "max-w-[12rem]",
        className,
      )}
    >
      {label}
    </button>
  ) : (
    <div
      className={cn(
        labelClassName,
        "relative",
        inRail ? "w-full" : "max-w-[12rem]",
        className,
      )}
    >
      {label}
    </div>
  );
}
