import { BotIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { SettingsNote } from "@/components/settings/settings-note";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsRowsSkeleton } from "@/components/settings/settings-rows-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { useAgentRunner } from "@/hooks/queries/agent/use-agent-runner";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { RevokeRunnerSection } from "./revoke-runner-section";
import { RunnerEnvSnippet } from "./runner-env-snippet";
import { RunnerStatusRow } from "./runner-status-row";
import { RunnerTokenSection } from "./runner-token-section";

export function RunnerSettings() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { data: config } = useGetConfig();
  const { canManageSettings, isCheckingPermissions } = useWorkspacePermission();
  const canManage = canManageSettings();
  const runnerQuery = useAgentRunner(workspace?.id, {
    enabled: canManage && config?.hasAiAgent === true,
  });
  // The new token lives only in this page's memory, never the query cache.
  const [token, setToken] = useState<{
    workspaceId: string;
    value: string;
  } | null>(null);
  const shownToken =
    token && token.workspaceId === workspace?.id ? token.value : null;

  const loading = (
    <SettingsCard>
      <SettingsRowsSkeleton rows={2} withDescription />
    </SettingsCard>
  );

  const renderBody = () => {
    if (!workspace || !config || isCheckingPermissions) return loading;
    if (!config.hasAiAgent) {
      return (
        <SettingsCard>
          <SettingsEmpty
            icon={<BotIcon />}
            title={t("settings:aiAgentPage.disabledTitle")}
            description={t("settings:aiAgentPage.disabledDescription")}
          />
        </SettingsCard>
      );
    }
    if (!canManage) {
      return (
        <SettingsCard>
          <SettingsEmpty
            icon={<LockIcon />}
            title={t("settings:aiAgentPage.membersTitle")}
            description={t("settings:aiAgentPage.membersDescription")}
          />
        </SettingsCard>
      );
    }
    if (runnerQuery.isPending) return loading;
    if (runnerQuery.isError) {
      return (
        <SettingsCard>
          <p
            role="alert"
            className="px-4 py-3.5 text-destructive-foreground text-sm"
          >
            {t("settings:aiAgentPage.loadError")}
          </p>
        </SettingsCard>
      );
    }

    const runner = runnerQuery.data;
    return (
      <>
        <SettingsSection title={t("settings:aiAgentPage.runner.sectionTitle")}>
          <SettingsCard>
            <RunnerStatusRow runner={runner} />
          </SettingsCard>
          <SettingsNote>{t("settings:aiAgentPage.runner.note")}</SettingsNote>
        </SettingsSection>
        <RunnerTokenSection
          workspaceId={workspace.id}
          configured={runner.configured}
          token={shownToken}
          onToken={(value) => setToken({ workspaceId: workspace.id, value })}
        />
        <RunnerEnvSnippet token={shownToken} />
        {runner.configured ? (
          <RevokeRunnerSection
            workspaceId={workspace.id}
            onRevoked={() => setToken(null)}
          />
        ) : null}
      </>
    );
  };

  return (
    <SettingsPage
      title={t("settings:aiAgentPage.title")}
      description={t("settings:aiAgentPage.subtitle")}
    >
      {renderBody()}
    </SettingsPage>
  );
}
