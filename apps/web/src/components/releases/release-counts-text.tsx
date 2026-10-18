import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";

// "3 features · 30 tasks · 18 unfinished"; features and unfinished only when
// there are some.
export function ReleaseCounts({
  counts,
  className,
}: {
  counts: ReleaseItemCounts;
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = [
    counts.features > 0 &&
      t("tasks:releases.counts.features", { count: counts.features }),
    t("tasks:releases.counts.tasks", { count: counts.tasks }),
    counts.unfinished > 0 &&
      t("tasks:releases.counts.unfinished", { count: counts.unfinished }),
  ].filter(Boolean);

  return (
    <p
      className={cn(
        "truncate text-muted-foreground text-xs tabular-nums",
        className,
      )}
    >
      {parts.join(" · ")}
    </p>
  );
}
