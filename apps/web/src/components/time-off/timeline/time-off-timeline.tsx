import { useId } from "react";
import { useTranslation } from "react-i18next";
import type {
  TimeOffEntry,
  TimeOffHoliday,
  TimeOffRequest,
} from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { monthDays } from "@/lib/time-off/time-off-month";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { dayOfWeek, isWeekendDay } from "./day-of-week";
import { TimeOffDateHeader } from "./time-off-date-header";
import { TimeOffMemberRow } from "./time-off-member-row";
import type { TimelineMember } from "./timeline-members";

const NO_ENTRIES: TimeOffEntry[] = [];
const NO_HOLIDAYS: TimeOffHoliday[] = [];
const DAY_WIDTH_REM = 2;

type TimeOffTimelineProps = {
  // YYYY-MM.
  month: string;
  members: readonly TimelineMember[];
  entriesByUser: ReadonlyMap<string, TimeOffEntry[]>;
  holidaysByUser: ReadonlyMap<string, TimeOffHoliday[]>;
  viewerId?: string;
  today: string;
  // The previous month's data is showing while this one loads.
  busy?: boolean;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (request: TimeOffRequest) => void;
};

// One CSS grid template (member rail, then a column per day) shared by the
// header, the weekend background and every row, so they always line up.
export function TimeOffTimeline({
  month,
  members,
  entriesByUser,
  holidaysByUser,
  viewerId,
  today,
  busy = false,
  onEdit,
  onCancel,
}: TimeOffTimelineProps) {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const hintId = useId();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const days = monthDays(month);
  const gridTemplateColumns = `var(--time-off-rail) repeat(${days.length}, minmax(${DAY_WIDTH_REM}rem, 1fr))`;
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <p id={hintId} className="sr-only">
        {t("team:timeOff.timeline.scrollHint")}
      </p>
      <div
        role="region"
        aria-label={t("team:timeOff.timeline.label", { month: monthLabel })}
        aria-describedby={hintId}
        aria-busy={busy || undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable region must be focusable for keyboard scrolling in every browser.
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div
          className="relative [--time-off-rail:8.5rem] sm:[--time-off-rail:12rem]"
          style={{
            minWidth: `calc(var(--time-off-rail) + ${days.length * DAY_WIDTH_REM}rem)`,
          }}
        >
          <TimeOffDateHeader
            days={days}
            today={today}
            weekStartsOn={weekStartsOn}
            gridTemplateColumns={gridTemplateColumns}
          />
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid"
              style={{ gridTemplateColumns }}
            >
              <div />
              {days.map((day) => (
                <div
                  key={day}
                  className={cn(
                    "border-l border-border/40",
                    isWeekendDay(day) && "bg-muted/40",
                    dayOfWeek(day) === weekStartsOn && "border-border",
                    day === today && "bg-primary/5",
                  )}
                />
              ))}
            </div>
            <ul
              className={cn(
                "relative transition-opacity",
                busy && "opacity-60",
              )}
            >
              {members.map((member) => (
                <TimeOffMemberRow
                  key={member.userId}
                  member={member}
                  entries={entriesByUser.get(member.userId) ?? NO_ENTRIES}
                  holidays={holidaysByUser.get(member.userId) ?? NO_HOLIDAYS}
                  firstDay={days[0] ?? `${month}-01`}
                  dayCount={days.length}
                  gridTemplateColumns={gridTemplateColumns}
                  isViewer={member.userId === viewerId}
                  today={today}
                  onEdit={onEdit}
                  onCancel={onCancel}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
