import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function ReleaseGroupingFeedback({
  loading,
  error,
  retrying,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground"
      >
        <span>{t("tasks:releases.detail.groupingLoadError")}</span>
        <Button size="xs" variant="ghost" disabled={retrying} onClick={onRetry}>
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  if (loading)
    return (
      <p
        role="status"
        className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground"
      >
        {t("tasks:milestones.loading")}
      </p>
    );
  return null;
}
