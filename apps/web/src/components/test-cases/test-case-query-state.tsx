import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Loading and error states shared by the test case lists.
export function TestCaseQueryState({
  isPending,
  isError,
  onRetry,
}: {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("tasks:testCases.loading")}
      </p>
    );
  if (isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p>{t("tasks:testCases.loadError")}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  return null;
}
