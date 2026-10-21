import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import {
  resolveOriginRelease,
  type TaskReleaseOrigin,
} from "@/components/task/task-release-origin";
import {
  FeatureComposer,
  type FeatureCompositionDraft,
} from "./feature-composition";

export function FeatureCompositionSection({
  projectId,
  workspaceId,
  origin,
  value,
  defaultReleaseId,
  onReady,
  onChange,
  disabled,
  canManage,
}: {
  projectId: string;
  workspaceId: string;
  origin: TaskReleaseOrigin | null;
  value: FeatureCompositionDraft | null;
  defaultReleaseId: string | null;
  onReady: (releaseId: string | null) => void;
  onChange: (next: FeatureCompositionDraft) => void;
  disabled: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const originReleaseId =
    origin?.projectId === projectId ? origin.releaseId : undefined;
  const releases = useGetReleases(projectId, {
    enabled: Boolean(originReleaseId) && value === null,
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (value !== null) return;
    if (!originReleaseId) {
      onReady(null);
    } else if (
      !releases.isFetching &&
      !releases.isPending &&
      !releases.isError &&
      releases.data !== undefined
    ) {
      onReady(resolveOriginRelease(originReleaseId, projectId, releases.data));
    }
  }, [
    value,
    originReleaseId,
    projectId,
    releases.isFetching,
    releases.isPending,
    releases.isError,
    releases.data,
    onReady,
  ]);

  if (value !== null) {
    return (
      <FeatureComposer
        projectId={projectId}
        workspaceId={workspaceId}
        value={value}
        defaultReleaseId={defaultReleaseId}
        onChange={onChange}
        disabled={disabled}
        canManage={canManage}
      />
    );
  }
  return releases.isError && originReleaseId ? (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 text-sm"
    >
      <p>{t("tasks:featureComposer.releaseContextError")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || releases.isFetching}
        onClick={() => void releases.refetch()}
      >
        {t("common:error.tryAgain")}
      </Button>
    </div>
  ) : (
    <p role="status" className="text-sm text-muted-foreground">
      {t("common:empty.loading")}
    </p>
  );
}
