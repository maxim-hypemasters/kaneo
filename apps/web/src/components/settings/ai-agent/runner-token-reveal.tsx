import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CopyTextButton } from "./copy-text-button";

type RunnerTokenRevealProps = {
  token: string;
};

// Kaneo keeps only a hash, so this is the one chance to copy the token.
export function RunnerTokenReveal({ token }: RunnerTokenRevealProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 px-4 py-3.5">
      <p
        role="status"
        className="flex items-start gap-2 text-warning-foreground text-xs"
      >
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-px size-3.5 shrink-0"
        />
        <span>{t("settings:aiAgentPage.runner.token.shownOnce")}</span>
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/40 py-1.5 ps-3 pe-1.5">
        <code className="min-w-0 flex-1 select-all truncate font-mono text-xs">
          {token}
        </code>
        <CopyTextButton
          text={token}
          label={t("settings:aiAgentPage.runner.token.copyLabel")}
        />
      </div>
    </div>
  );
}
