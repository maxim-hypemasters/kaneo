import { useTranslation } from "react-i18next";
import { getBarGridColumns } from "@/components/gantt/timeline";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import type {
  TimeOffEntry,
  TimeOffHoliday,
  TimeOffRequest,
} from "@/fetchers/time-off/types";
import { parseReleaseDate } from "@/lib/releases/release-date";
import { TimeOffBar } from "./time-off-bar";
import { TimeOffHolidayBar } from "./time-off-holiday-bar";
import type { TimelineMember } from "./timeline-members";

type TimeOffMemberRowProps = {
  member: TimelineMember;
  entries: readonly TimeOffEntry[];
  // The member's calendar holidays.
  holidays: readonly TimeOffHoliday[];
  // The first visible day, YYYY-MM-DD, and how many days show.
  firstDay: string;
  dayCount: number;
  gridTemplateColumns: string;
  isViewer: boolean;
  today: string;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (request: TimeOffRequest) => void;
};

export function TimeOffMemberRow({
  member,
  entries,
  holidays,
  firstDay,
  dayCount,
  gridTemplateColumns,
  isViewer,
  today,
  onEdit,
  onCancel,
}: TimeOffMemberRowProps) {
  const { t } = useTranslation();
  const name = member.name || t("common:people.unknown");
  const rangeStart = parseReleaseDate(firstDay);

  return (
    <li
      aria-label={name}
      className="grid min-h-11 border-b border-border/60"
      style={{ gridTemplateColumns }}
    >
      <div
        className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r bg-background px-3"
        style={{ gridColumn: 1, gridRow: 1 }}
      >
        <AssigneeAvatar
          assigned
          name={member.name}
          image={member.image}
          className="size-5"
        />
        <span className="min-w-0 truncate font-medium text-xs" title={name}>
          {name}
        </span>
        {isViewer ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            {t("team:timeOff.you")}
          </span>
        ) : null}
      </div>
      {/* Before the time off, which covers a holiday it spans. */}
      {holidays.map((holiday) => {
        const day = parseReleaseDate(holiday.date);
        const columns = getBarGridColumns(day, day, rangeStart, dayCount);
        if (!columns.barInView) return null;
        return (
          <TimeOffHolidayBar
            key={holiday.date}
            holiday={holiday}
            memberName={name}
            columns={columns}
            today={today}
          />
        );
      })}
      {entries.map((entry) => {
        const columns = getBarGridColumns(
          parseReleaseDate(entry.startDate),
          parseReleaseDate(entry.endDate),
          rangeStart,
          dayCount,
        );
        if (!columns.barInView) return null;
        return (
          <TimeOffBar
            key={entry.id}
            entry={entry}
            memberName={name}
            columns={columns}
            today={today}
            onEdit={onEdit}
            onCancel={onCancel}
          />
        );
      })}
    </li>
  );
}
