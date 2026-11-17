import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ContinuePromptProps = {
  /** The user stopped the answer, rather than it ending early. */
  stopped: boolean;
  onContinue: () => void;
  disabled?: boolean;
};

// An answer that didn't finish picks up again only on a click, so nothing is
// spent without the user asking.
export function ContinuePrompt({
  stopped,
  onContinue,
  disabled = false,
}: ContinuePromptProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <span>
        {stopped
          ? t("workspace:assistant.conversation.stoppedPrompt")
          : t("workspace:assistant.conversation.resumePrompt")}
      </span>
      <Button
        size="xs"
        variant="outline"
        onClick={onContinue}
        disabled={disabled}
      >
        <PlayIcon aria-hidden="true" />
        {t("workspace:assistant.conversation.continue")}
      </Button>
    </div>
  );
}
