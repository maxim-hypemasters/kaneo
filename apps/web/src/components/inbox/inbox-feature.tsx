import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { featureRoute } from "@/components/task/features/feature-route";
import { FeatureCommentComposer } from "@/components/task/features/workspace/feature-comment-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";
import useGetProject from "@/hooks/queries/project/use-get-project";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import {
  INBOX_VISIBLE_ACTIVITIES,
  InboxRecentActivity,
} from "./inbox-recent-activity";
import { InboxResourceState } from "./inbox-resource-state";

type InboxFeatureProps = {
  featureId: string;
  workspaceId?: string;
};

// The Feature a notification points at. Features have no status, priority
// or assignee, so it shows where the Feature lives and its recent history.
export function InboxFeature({ featureId, workspaceId }: InboxFeatureProps) {
  const { t } = useTranslation();
  const featureQuery = useGetTask(featureId, true);
  const feature = featureQuery.data;
  const activityQuery = useGetActivitiesByTaskId(
    featureId,
    true,
    INBOX_VISIBLE_ACTIVITIES,
  );
  const openWorkspaceId = feature?.workspaceId || workspaceId;
  const { data: project } = useGetProject({
    id: feature?.projectId ?? "",
    workspaceId: openWorkspaceId ?? "",
  });
  const { canUpdateFeatures } = useWorkspacePermission();
  const navigate = useNavigate();
  useShortcut(
    "openFocusedTask",
    () => {
      if (!feature || !openWorkspaceId) return;
      navigate(featureRoute(openWorkspaceId, feature.projectId, feature.id));
    },
    { enabled: Boolean(feature && openWorkspaceId) },
  );

  if (featureQuery.isLoading || !feature) {
    return (
      <InboxResourceState
        query={featureQuery}
        unavailableMessage={t("notifications:inbox.featureUnavailable")}
        loadErrorMessage={t("notifications:inbox.featureLoadError")}
      />
    );
  }

  const key =
    project?.slug && feature.number != null
      ? `${project.slug}-${feature.number}`
      : null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-2xl text-foreground tracking-tight">
            <TaskTypeGlyph
              type="feature"
              className="size-5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0">{feature.title}</span>
          </h2>
          {openWorkspaceId && (
            <Button
              variant="outline"
              size="xs"
              render={
                <Link
                  {...featureRoute(
                    openWorkspaceId,
                    feature.projectId,
                    feature.id,
                  )}
                />
              }
            >
              {t("notifications:inbox.openFeature")}
              <ArrowUpRight />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-foreground/85">
          {project && (
            <dl className="flex items-center gap-1.5">
              <dt className="sr-only">{t("tasks:properties.project")}</dt>
              <dd>{project.name}</dd>
            </dl>
          )}
          {key && (
            <span className="font-mono text-muted-foreground text-xs">
              {key}
            </span>
          )}
          {feature.archivedAt && (
            <Badge variant="outline">
              {t("tasks:features.library.archived")}
            </Badge>
          )}
        </div>
      </div>

      <InboxRecentActivity query={activityQuery} subject="feature">
        {canUpdateFeatures() && (
          <FeatureCommentComposer
            featureId={feature.id}
            projectId={feature.projectId}
          />
        )}
      </InboxRecentActivity>
    </div>
  );
}
