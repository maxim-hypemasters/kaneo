import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

// Assessments and Ship need the workspace's runner, set up by an admin in
// workspace settings.
export function RunnerMissingNote() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-warning-foreground text-xs"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {t("settings:aiAgentPage.project.runnerMissing")}
      </span>
      <Link
        to="/dashboard/settings/workspace/ai-agent"
        className="font-medium underline underline-offset-2 hover:no-underline"
      >
        {t("settings:aiAgentPage.project.runnerMissingLink")}
      </Link>
    </div>
  );
}
