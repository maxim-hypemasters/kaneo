import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ReleasePhase } from "@/types/release";

export function ReleaseTimelineDate({
  date,
  today,
  phase,
}: {
  date: string;
  today: string;
  phase: ReleasePhase;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage || i18n?.language || "en-US";
  const value = new Date(`${date}T00:00:00.000Z`);
  const active = phase === "inProgress" || phase === "codeFreeze";
  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(value);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
      value,
    );

  return (
    <div
      className={cn(
        "relative flex min-w-0 justify-end border-r border-border/70 pr-3 text-right text-[10px] leading-4 text-muted-foreground sm:pr-5 sm:text-xs",
        active && "border-primary/70",
      )}
    >
      <time dateTime={date} title={fullDate}>
        <span className="sr-only">
          {t("tasks:releases.dates.submission")}: {fullDate}
        </span>
        <span aria-hidden="true" className="flex flex-col">
          <span>{part({ month: "short" })}</span>
          <span>{part({ day: "numeric" })}</span>
          {date.slice(0, 4) !== today.slice(0, 4) && (
            <span className="text-[9px] sm:text-[10px]">
              {part({ year: "numeric" })}
            </span>
          )}
        </span>
      </time>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0 right-0 size-2 translate-x-1/2 rounded-full border border-muted-foreground/60 bg-card ring-4 ring-card",
          active && "border-primary bg-primary",
          phase === "pastSubmission" && "bg-muted-foreground/60",
        )}
      />
    </div>
  );
}
