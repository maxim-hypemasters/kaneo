import { LockIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { SettingsNote } from "@/components/settings/settings-note";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsRowsSkeleton } from "@/components/settings/settings-rows-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { useAssistantSettings } from "@/hooks/queries/assistant/use-assistant-settings";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { AssistantKeyForm } from "./assistant-key-form";
import { canShowKeyUsage, getAssistantKeyStatus } from "./assistant-key-status";
import { AssistantRemoveKeySection } from "./assistant-remove-key-section";
import { AssistantStatusRow } from "./assistant-status-row";
import { AssistantUsageRow } from "./assistant-usage-row";

export function AssistantSettings() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { data: config } = useGetConfig();
  const { canManageSettings, isCheckingPermissions } = useWorkspacePermission();
  const canManage = canManageSettings();
  const settingsQuery = useAssistantSettings(workspace?.id, {
    enabled: canManage && config?.hasAssistant === true,
  });

  const loading = (
    <SettingsCard>
      <SettingsRowsSkeleton rows={3} withDescription />
    </SettingsCard>
  );

  const renderBody = () => {
    if (!workspace || !config || isCheckingPermissions) return loading;
    if (!config.hasAssistant) {
      return (
        <SettingsCard>
          <SettingsEmpty
            icon={<SparklesIcon />}
            title={t("settings:assistantPage.disabledTitle")}
            description={t("settings:assistantPage.disabledDescription")}
          />
        </SettingsCard>
      );
    }
    if (!canManage) {
      return (
        <SettingsCard>
          <SettingsEmpty
            icon={<LockIcon />}
            title={t("settings:assistantPage.membersTitle")}
            description={t("settings:assistantPage.membersDescription")}
          />
        </SettingsCard>
      );
    }
    if (settingsQuery.isPending) return loading;
    if (settingsQuery.isError) {
      return (
        <SettingsCard>
          <p
            role="alert"
            className="px-4 py-3.5 text-destructive-foreground text-sm"
          >
            {t("settings:assistantPage.loadError")}
          </p>
        </SettingsCard>
      );
    }

    const settings = settingsQuery.data;
    return (
      <>
        <SettingsSection
          title={t("settings:assistantPage.status.sectionTitle")}
        >
          <SettingsCard>
            <AssistantStatusRow settings={settings} />
            {canShowKeyUsage(getAssistantKeyStatus(settings)) ? (
              <AssistantUsageRow workspaceId={workspace.id} />
            ) : null}
          </SettingsCard>
        </SettingsSection>
        <SettingsSection
          title={t("settings:assistantPage.form.sectionTitle")}
          description={t("settings:assistantPage.form.sectionDescription")}
        >
          <AssistantKeyForm
            key={`${workspace.id}:${settings.updatedAt ?? "unset"}`}
            workspaceId={workspace.id}
            settings={settings}
          />
          <SettingsNote icon={LockIcon}>
            {t("settings:assistantPage.notes.dataSharing")}
          </SettingsNote>
          <SettingsNote icon={UsersIcon}>
            {t("settings:assistantPage.notes.sharedKey")}
          </SettingsNote>
        </SettingsSection>
        {settings.configured ? (
          <AssistantRemoveKeySection workspaceId={workspace.id} />
        ) : null}
      </>
    );
  };

  return (
    <SettingsPage
      title={t("settings:assistantPage.title")}
      description={t("settings:assistantPage.subtitle")}
    >
      {renderBody()}
    </SettingsPage>
  );
}
