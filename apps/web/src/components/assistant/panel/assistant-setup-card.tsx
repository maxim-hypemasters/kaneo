import { Link } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/hooks/use-stored-state";

const parseDismissed = (raw: unknown) => raw === true;

type AssistantSetupCardProps = {
  workspaceId: string;
  /** The saved key can no longer be read and must be entered again. */
  unreadable: boolean;
};

// For admins while the assistant is off. "Not now" is remembered per
// workspace in this browser.
export function AssistantSetupCard({
  workspaceId,
  unreadable,
}: AssistantSetupCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [dismissed, setDismissed] = useStoredState(
    `kaneo:assistant-setup-dismissed:${workspaceId}`,
    parseDismissed,
    false,
  );
  if (dismissed) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border border-dashed bg-card px-5 py-4 sm:flex-row sm:items-center"
    >
      <SparklesIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground max-sm:hidden"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="font-semibold text-foreground text-sm">
          {unreadable
            ? t("workspace:assistant.setup.unreadableTitle")
            : t("workspace:assistant.setup.title")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {unreadable
            ? t("workspace:assistant.setup.unreadableDescription")
            : t("workspace:assistant.setup.description")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          {t("workspace:assistant.setup.dismiss")}
        </Button>
        <Button
          size="sm"
          render={<Link to="/dashboard/settings/workspace/assistant" />}
        >
          {unreadable
            ? t("workspace:assistant.setup.unreadableAction")
            : t("workspace:assistant.setup.action")}
        </Button>
      </div>
    </section>
  );
}
