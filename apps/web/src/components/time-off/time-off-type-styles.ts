import { Landmark, type LucideIcon, Thermometer, TreePalm } from "lucide-react";
import type { TimeOffType } from "@/fetchers/time-off/types";

export type TimeOffTypeStyle = {
  labelKey: string;
  icon: LucideIcon;
  iconClassName: string;
  // Fill and border of a timeline bar. Pending bars add a dashed border, so
  // status never depends on colour alone.
  barClassName: string;
};

export const TIME_OFF_TYPE_ORDER: readonly TimeOffType[] = [
  "vacation",
  "sick",
  "public_holiday",
];

export const TIME_OFF_TYPE_STYLES = {
  vacation: {
    labelKey: "team:timeOff.types.vacation",
    icon: TreePalm,
    iconClassName: "text-info",
    barClassName: "border-info/60 bg-info/16 text-info-foreground",
  },
  sick: {
    labelKey: "team:timeOff.types.sick",
    icon: Thermometer,
    iconClassName: "text-destructive",
    barClassName:
      "border-destructive/50 bg-destructive/12 text-destructive-foreground",
  },
  public_holiday: {
    labelKey: "team:timeOff.types.publicHoliday",
    icon: Landmark,
    iconClassName: "text-success",
    barClassName: "border-success/60 bg-success/16 text-success-foreground",
  },
} as const satisfies Record<TimeOffType, TimeOffTypeStyle>;

// A timeline bar: a button that opens its details. Time off and holidays
// share it, so a colleague's holiday looks like their private time off.
export const TIME_OFF_BAR_BUTTON_CLASS_NAME =
  "relative z-[1] mx-0.5 my-2 flex h-7 min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left font-medium text-xs outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring";

// Other members' entries and holidays carry no type: a neutral "Away".
export const AWAY_BAR_CLASS_NAME =
  "border-foreground/20 bg-muted-foreground/12 text-foreground";
