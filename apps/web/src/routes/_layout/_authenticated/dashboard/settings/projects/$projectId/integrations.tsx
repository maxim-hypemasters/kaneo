import { useProjectWebSocket } from "@/hooks/use-project-websocket";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { INTEGRATIONS } from "@/components/project/integrations/integration-definitions";
import { IntegrationsGroup } from "@/components/project/integrations/integrations-group";
import { useIntegrationStatuses } from "@/components/project/integrations/use-integration-statuses";
import { SettingsPage } from "@/components/settings/settings-page";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$projectId/integrations",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  useProjectWebSocket(projectId);
  const { data: config } = useGetConfig();
  const { canManageSettings } = useWorkspacePermission();
  // Its settings need workspace:manage_settings, unlike the other
  // integrations, so members would only get a row that cannot load.
  const showAiAgent = config?.hasAiAgent === true && canManageSettings();
  const { statuses, retry } = useIntegrationStatuses(projectId, {
    hasAiAgent: showAiAgent,
  });
  const integrations = INTEGRATIONS.filter(
    (integration) => integration.id !== "ai-agent" || showAiAgent,
  );

  return (
    <>
      <PageTitle title={t("settings:projectIntegrations.pageTitle")} />
      <SettingsPage
        title={t("settings:projectIntegrations.title")}
        description={t("settings:projectIntegrations.subtitle")}
      >
        <IntegrationsGroup
          title={t("settings:projectIntegrations.codeHostingTitle")}
          integrations={integrations.filter(
            (integration) => integration.category === "code",
          )}
          projectId={projectId}
          statuses={statuses}
          onRetry={retry}
        />
        <IntegrationsGroup
          title={t("settings:projectIntegrations.chatTitle")}
          integrations={integrations.filter(
            (integration) => integration.category === "chat",
          )}
          projectId={projectId}
          statuses={statuses}
          onRetry={retry}
        />
      </SettingsPage>
    </>
  );
}
