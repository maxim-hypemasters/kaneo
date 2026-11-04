import { useCurrentMinute } from "@/hooks/use-current-minute";
import { differenceInCalendarDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { useLocalDay } from "@/hooks/use-local-day";
import { cn } from "@/lib/cn";
import { formatDate, formatDateShort } from "@/lib/format";

type DueDateTextProps = {
  dueDate: string | null;
  className?: string;
  applied?: boolean;
};

export function DueDateText({
  dueDate,
  className,
  applied = false,
}: DueDateTextProps) {
  const { t } = useTranslation();
  const day = useLocalDay();
  const now = useCurrentMinute();

  if (!dueDate) return null;

  const days = differenceInCalendarDays(new Date(dueDate), new Date(day));
  const overdue = days < 0 || (applied && new Date(dueDate).getTime() < now);
  const text =
    days === 0
      ? t("workspace:myWork.due.today")
      : days === 1
        ? t("workspace:myWork.due.tomorrow")
        : days > 1 && days <= 6
          ? formatDate(dueDate, { weekday: "long" })
          : formatDateShort(dueDate);

  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        overdue
          ? "font-medium text-destructive-foreground"
          : days === 0
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
