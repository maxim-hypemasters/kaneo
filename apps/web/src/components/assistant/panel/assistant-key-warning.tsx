import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

type AssistantKeyWarningProps = {
  reason: "key_rejected" | "out_of_credits";
  canManage: boolean;
};

// OpenRouter's last answer for the workspace's key was a refusal. Chatting
// stays possible (the next answer may work), so this only warns.
export function AssistantKeyWarning({
  reason,
  canManage,
}: AssistantKeyWarningProps) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-warning/30 border-b bg-warning/8 px-4 py-2 text-warning-foreground text-xs"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {reason === "key_rejected"
          ? t("workspace:assistant.warning.keyRejected")
          : t("workspace:assistant.warning.outOfCredits")}
      </span>
      {canManage ? (
        <Link
          to="/dashboard/settings/workspace/assistant"
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {t("workspace:assistant.warning.updateKey")}
        </Link>
      ) : null}
    </div>
  );
}
