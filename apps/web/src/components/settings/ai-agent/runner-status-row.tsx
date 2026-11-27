import { ServerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { StatusBadge } from "@/components/settings/status-badge";
import type { AgentRunnerStatus } from "@/fetchers/agent/get-agent-runner";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { runnerStatusDisplay } from "./runner-status-display";

type RunnerStatusRowProps = {
  runner: AgentRunnerStatus;
};

export function RunnerStatusRow({ runner }: RunnerStatusRowProps) {
  const { t } = useTranslation();
  const display = runnerStatusDisplay(runner);

  return (
    <SettingsRow
      icon={<ServerIcon />}
      title={t("settings:aiAgentPage.runner.status.title")}
      badge={
        <StatusBadge tone={display.tone}>{t(display.labelKey)}</StatusBadge>
      }
      description={
        <>
          <p>
            {t(display.descriptionKey, {
              lastSeen: runner.lastSeenAt
                ? formatRelativeTime(runner.lastSeenAt)
                : "",
            })}
          </p>
          {runner.configured ? (
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {runner.tokenPrefix ? (
                <div className="flex gap-1">
                  <dt>{t("settings:aiAgentPage.runner.status.token")}</dt>
                  <dd className="font-mono">{runner.tokenPrefix}…</dd>
                </div>
              ) : null}
              {runner.runnerVersion ? (
                <div className="flex gap-1">
                  <dt>{t("settings:aiAgentPage.runner.status.version")}</dt>
                  <dd className="font-mono">{runner.runnerVersion}</dd>
                </div>
              ) : null}
              {runner.lastSeenAt ? (
                <div className="flex gap-1">
                  <dt>{t("settings:aiAgentPage.runner.status.lastSeen")}</dt>
                  <dd>{formatDateTime(runner.lastSeenAt)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {/* The runner reports its GitHub credentials when it checks in. */}
          {runner.configured && runner.lastSeenAt ? (
            <p className="mt-1">
              {runner.canPush
                ? t("settings:aiAgentPage.runner.status.canPush")
                : t("settings:aiAgentPage.runner.status.cannotPush")}
            </p>
          ) : null}
        </>
      }
    />
  );
}
