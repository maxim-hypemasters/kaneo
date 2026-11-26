import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";

type RunnerNoteProps = {
  runner: TaskAgent["runner"];
  /** A check is waiting for the runner. */
  waiting: boolean;
  canManageSettings: boolean;
};

// Without a runner nothing queued ever starts, so this shows to everyone,
// not only while a check waits.
export function RunnerNote({
  runner,
  waiting,
  canManageSettings,
}: RunnerNoteProps) {
  const { t } = useTranslation();

  if (!runner.configured) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("tasks:aiAgent.runnerMissing")}{" "}
        {canManageSettings ? (
          <Link
            to="/dashboard/settings/workspace/ai-agent"
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {t("tasks:aiAgent.runnerMissingLink")}
          </Link>
        ) : (
          t("tasks:aiAgent.runnerMissingAskAdmin")
        )}
      </p>
    );
  }

  if (waiting && !runner.online) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("tasks:aiAgent.runnerOffline")}
      </p>
    );
  }

  return null;
}
