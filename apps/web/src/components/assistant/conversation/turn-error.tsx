import { CircleAlertIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AssistantTurnError } from "@/hooks/use-assistant-turn";
import { assistantErrorMessageKey } from "../assistant-error-message";

type TurnErrorProps = {
  error: AssistantTurnError;
  /** Resumes the chat; offered only when that may help. */
  onRetry?: () => void;
  onDismiss: () => void;
  disabled?: boolean;
};

export function TurnError({
  error,
  onRetry,
  onDismiss,
  disabled = false,
}: TurnErrorProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/4 px-3 py-2 text-sm"
    >
      <CircleAlertIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-destructive-foreground"
      />
      <p className="min-w-0 flex-1 text-foreground">
        {t(assistantErrorMessageKey(error.code))}
      </p>
      {onRetry ? (
        <Button
          size="xs"
          variant="outline"
          onClick={onRetry}
          disabled={disabled}
          className="shrink-0"
        >
          <RotateCcwIcon aria-hidden="true" />
          {error.code === "ASSISTANT_STEP_LIMIT"
            ? t("workspace:assistant.conversation.continue")
            : t("workspace:assistant.conversation.retry")}
        </Button>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground"
        aria-label={t("workspace:assistant.conversation.dismiss")}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
