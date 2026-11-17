import type { LucideIcon } from "lucide-react";
import {
  AWAY_BAR_CLASS_NAME,
  TIME_OFF_TYPE_STYLES,
} from "@/components/time-off/time-off-type-styles";
import type { AwayKind } from "@/lib/time-off/away-days";

type GanttAwayStyle = {
  labelKey: string;
  icon: LucideIcon | null;
  // A lane band behind the bars.
  bandClassName: string;
  // The thin strip on a bar under the days away it covers.
  markClassName: string;
};

// The Team timeline's colours, so a type reads the same everywhere.
export const GANTT_AWAY_STYLES = {
  vacation: {
    labelKey: TIME_OFF_TYPE_STYLES.vacation.labelKey,
    icon: TIME_OFF_TYPE_STYLES.vacation.icon,
    bandClassName: TIME_OFF_TYPE_STYLES.vacation.barClassName,
    markClassName: "bg-info/70",
  },
  sick: {
    labelKey: TIME_OFF_TYPE_STYLES.sick.labelKey,
    icon: TIME_OFF_TYPE_STYLES.sick.icon,
    bandClassName: TIME_OFF_TYPE_STYLES.sick.barClassName,
    markClassName: "bg-destructive/70",
  },
  public_holiday: {
    labelKey: TIME_OFF_TYPE_STYLES.public_holiday.labelKey,
    icon: TIME_OFF_TYPE_STYLES.public_holiday.icon,
    bandClassName: TIME_OFF_TYPE_STYLES.public_holiday.barClassName,
    markClassName: "bg-success/70",
  },
  away: {
    labelKey: "team:timeOff.timeline.away",
    icon: null,
    bandClassName: AWAY_BAR_CLASS_NAME,
    markClassName: "bg-muted-foreground/60",
  },
} as const satisfies Record<AwayKind, GanttAwayStyle>;
