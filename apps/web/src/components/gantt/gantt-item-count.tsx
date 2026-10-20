import { useTranslation } from "react-i18next";

export function GanttItemCount({
  shown,
  total,
}: {
  shown: number;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <span className="hidden truncate text-xs text-muted-foreground tabular-nums sm:inline">
      {shown === total
        ? t("tasks:gantt.milestones.itemCount", { count: total })
        : t("tasks:gantt.milestones.shownCount", { shown, count: total })}
    </span>
  );
}
