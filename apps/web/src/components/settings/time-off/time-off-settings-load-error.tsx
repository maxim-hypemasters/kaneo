import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type TimeOffSettingsLoadErrorProps = {
  message: string;
  retrying: boolean;
  onRetry: () => void;
};

// A settings card's load error with a retry.
export function TimeOffSettingsLoadError({
  message,
  retrying,
  onRetry,
}: TimeOffSettingsLoadErrorProps) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-destructive-foreground text-sm">{message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
        loading={retrying}
        onClick={onRetry}
      >
        <RotateCcw aria-hidden="true" />
        {t("common:error.tryAgain")}
      </Button>
    </div>
  );
}
