import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceQueryState({
  error,
  onRetry,
}: {
  error?: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return error ? (
    <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm">
      <p>{t("tasks:features.workspace.loadFailed")}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t("common:error.tryAgain")}
      </Button>
    </div>
  ) : (
    <div
      role="status"
      aria-label={t("common:empty.loading")}
      className="space-y-3"
    >
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
