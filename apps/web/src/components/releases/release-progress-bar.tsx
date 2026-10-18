import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type ReleaseProgressBarProps = {
  completed: number;
  total: number;
  className?: string;
};

// A release's done tasks. The bar and the "12/30" are decoration; screen
// readers get the sentence.
export function ReleaseProgressBar({
  completed,
  total,
  className,
}: ReleaseProgressBarProps) {
  const { t } = useTranslation();
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        aria-hidden="true"
        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-input"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
            total > 0 && completed === total ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className="shrink-0 text-muted-foreground text-xs tabular-nums"
      >
        {t("tasks:releases.progress", { completed, total })}
      </span>
      <span className="sr-only">
        {t("tasks:releases.progressAria", { completed, count: total })}
      </span>
    </div>
  );
}
