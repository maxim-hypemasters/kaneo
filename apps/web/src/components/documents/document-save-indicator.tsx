import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { DocumentSaveStatus } from "./use-document-autosave";

// Routine saves are plain text, not a live region, so screen readers are not
// interrupted while someone types. Only a failure is announced.
export function DocumentSaveIndicator({
  status,
  onRetry,
}: {
  status: DocumentSaveStatus;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (status === "saving" || status === "saved")
    return (
      <span className="px-2 text-xs text-muted-foreground">
        {status === "saving"
          ? t("common:documentEditor.saving")
          : t("tasks:features.workspace.documentSaved")}
      </span>
    );
  if (status !== "error") return null;
  return (
    <span className="flex items-center gap-1 pl-2 text-xs">
      <span role="alert" className="text-destructive">
        {t("tasks:features.workspace.documentSaveFailed")}
      </span>
      <Button type="button" size="xs" variant="ghost" onClick={onRetry}>
        {t("common:error.tryAgain")}
      </Button>
    </span>
  );
}
