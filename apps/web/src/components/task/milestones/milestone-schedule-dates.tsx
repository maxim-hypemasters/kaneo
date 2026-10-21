import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { formatDateMedium } from "@/lib/format";

export function MilestoneScheduleDates({
  startDate,
  endDate,
}: Pick<Milestone, "startDate" | "endDate">) {
  const { t } = useTranslation();
  return (
    <dl className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(["start", "end"] as const).map((boundary) => {
        const value = boundary === "start" ? startDate : endDate;
        const label = t(
          boundary === "start"
            ? "tasks:milestones.startDate"
            : "tasks:milestones.endDate",
        );
        return (
          <div key={boundary} className="min-w-0 space-y-1.5 text-sm">
            <dt>{label}</dt>
            <dd
              aria-label={label}
              className="flex min-h-9 items-center gap-2 text-muted-foreground"
            >
              <CalendarIcon aria-hidden="true" className="size-4 shrink-0" />
              {value ? (
                <time dateTime={value}>
                  {formatDateMedium(`${value}T12:00:00`)}
                </time>
              ) : (
                t("tasks:properties.noDate")
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
