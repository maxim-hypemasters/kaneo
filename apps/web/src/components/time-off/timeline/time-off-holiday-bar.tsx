import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TimeOffHoliday } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { formatReleaseRange } from "@/lib/releases/release-date";
import {
  AWAY_BAR_CLASS_NAME,
  TIME_OFF_BAR_BUTTON_CLASS_NAME,
  TIME_OFF_TYPE_STYLES,
} from "../time-off-type-styles";
import type { TimeOffBarColumns } from "./time-off-bar";
import { TimeOffHolidayDetails } from "./time-off-holiday-details";

type TimeOffHolidayBarProps = {
  holiday: TimeOffHoliday;
  memberName: string;
  columns: TimeOffBarColumns;
  today: string;
};

const HOLIDAY_STYLE = TIME_OFF_TYPE_STYLES.public_holiday;

// One public holiday from a member's calendar. Its name shows only on your
// own and to approvers; anyone else's looks and opens like time off whose
// details are private.
export function TimeOffHolidayBar({
  holiday,
  memberName,
  columns,
  today,
}: TimeOffHolidayBarProps) {
  const { t } = useTranslation();
  // As a one-day time-off entry formats its range.
  const date = formatReleaseRange(holiday.date, holiday.date, { today });
  const name = holiday.name;
  const text = name ?? t("team:timeOff.timeline.away");
  const Icon = name ? HOLIDAY_STYLE.icon : null;
  const label = name
    ? t("team:timeOff.timeline.holidayLabel", {
        name: memberName,
        holiday: name,
        date,
      })
    : t("team:timeOff.timeline.barLabel", { name: memberName, range: date });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-status={name ? "holiday" : "away"}
          className={cn(
            TIME_OFF_BAR_BUTTON_CLASS_NAME,
            name ? HOLIDAY_STYLE.barClassName : AWAY_BAR_CLASS_NAME,
          )}
          style={{
            gridColumn: `${columns.lineStart + 1} / ${columns.lineEnd + 1}`,
            gridRow: 1,
          }}
        >
          {Icon ? (
            <Icon aria-hidden="true" className="size-3 shrink-0" />
          ) : null}
          <span aria-hidden="true" className="truncate">
            {text}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <TimeOffHolidayDetails
          memberName={memberName}
          date={date}
          holidayName={name}
        />
      </PopoverContent>
    </Popover>
  );
}
