import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Shown above the chart when members' days away couldn't load: the chart
// still works, without them.
export function GanttAwayLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm text-muted-foreground"
    >
      {t("tasks:gantt.away.loadError")}
      <Button size="xs" variant="outline" onClick={onRetry}>
        {t("tasks:releases.retry")}
      </Button>
    </div>
  );
}
