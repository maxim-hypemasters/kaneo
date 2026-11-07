import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLatestFeatureUpdate } from "@/hooks/queries/feature/use-feature-workspace";
import { FeatureUpdateCard } from "./feature-update-card";
import { WorkspaceQueryState } from "./workspace-query-state";

export function FeatureLatestUpdate({
  featureId,
  projectId,
  onOpenActivity,
}: {
  featureId: string;
  projectId: string;
  onOpenActivity: (updateId?: string) => void;
}) {
  const { t } = useTranslation();
  const query = useLatestFeatureUpdate(projectId, featureId);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {t("tasks:features.workspace.latestUpdate")}
        </h3>
        {query.data && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onOpenActivity(query.data?.id)}
          >
            {t("tasks:features.workspace.viewUpdate")}
          </Button>
        )}
      </div>
      {query.isPending || (query.isError && !query.data) ? (
        <WorkspaceQueryState
          error={query.isError}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <FeatureUpdateCard
          activity={query.data}
          projectId={projectId}
          compact
        />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("tasks:features.workspace.noUpdates")}
        </p>
      )}
    </section>
  );
}
