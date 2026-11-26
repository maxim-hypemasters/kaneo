import { useTranslation } from "react-i18next";
import { DeliveryPanelSkeleton } from "@/components/project/integrations/delivery-panel/delivery-panel-skeleton";
import { Button } from "@/components/ui/button";
import { useProjectAgentSettings } from "@/hooks/queries/agent/use-project-agent-settings";
import { AiAgentSettingsForm } from "./ai-agent-settings-form";

type AiAgentSettingsProps = {
  projectId: string;
};

export function AiAgentSettings({ projectId }: AiAgentSettingsProps) {
  const { t } = useTranslation();
  const query = useProjectAgentSettings(projectId);

  if (query.isPending) return <DeliveryPanelSkeleton />;
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-0 flex-1 text-destructive-foreground text-sm">
          {t("settings:aiAgentPage.project.loadError")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  }

  return (
    <AiAgentSettingsForm
      key={projectId}
      projectId={projectId}
      settings={query.data}
    />
  );
}
