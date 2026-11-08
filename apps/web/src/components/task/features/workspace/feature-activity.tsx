import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Activity from "@/components/activity";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Timeline } from "@/components/ui/timeline";
import {
  featureWorkspaceKey,
  useFeatureActivity,
  useFeatureUpdate,
} from "@/hooks/queries/feature/use-feature-workspace";
import { FeatureCommentComposer } from "./feature-comment-composer";
import { FeatureUpdateCard } from "./feature-update-card";
import { FeatureUpdateComposer } from "./feature-update-composer";
import { WorkspacePagination } from "./workspace-pagination";
import { WorkspaceQueryState } from "./workspace-query-state";

export function FeatureActivity({
  featureId,
  projectId,
  selectedUpdateId,
  onUpdateChange,
}: {
  featureId: string;
  projectId: string;
  selectedUpdateId?: string;
  onUpdateChange?: (id?: string) => void;
}) {
  const { t } = useTranslation();
  const requestLeave = useDocumentDraftNavigation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("update");
  const [page, setPage] = useState(1);
  const highlightedUpdate = useRef<string | undefined>(undefined);
  const query = useFeatureActivity(projectId, featureId, page);
  const selectedFromPage = query.data?.data.find(
    (activity) =>
      activity.type === "feature_update" && activity.id === selectedUpdateId,
  );
  const selectedIsOnPage = Boolean(selectedFromPage);
  const selected = useFeatureUpdate(
    projectId,
    featureId,
    selectedUpdateId,
    Boolean(query.data && !selectedIsOnPage),
  );
  const selectedActivity = selectedFromPage ?? selected.data;
  useEffect(() => {
    if (selectedFromPage)
      queryClient.setQueryData(
        [
          ...featureWorkspaceKey(projectId, featureId),
          "update",
          selectedFromPage.id,
        ],
        selectedFromPage,
      );
  }, [queryClient, projectId, featureId, selectedFromPage]);
  useEffect(() => {
    if (
      !selectedUpdateId ||
      (!query.data && !selected.data) ||
      highlightedUpdate.current === selectedUpdateId
    )
      return;
    const element = document.getElementById(
      `feature-update-${selectedUpdateId}`,
    );
    if (element) {
      element.scrollIntoView?.({ block: "nearest" });
      highlightedUpdate.current = selectedUpdateId;
    }
  }, [query.data, selected.data, selectedUpdateId]);
  const composerTabs = (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        if (typeof value === "string") void requestLeave(() => setMode(value));
      }}
    >
      <TabsList aria-label={t("tasks:features.workspace.composer")}>
        <TabsTab value="comment">
          {t("tasks:features.workspace.comment")}
        </TabsTab>
        <TabsTab value="update">{t("tasks:features.workspace.update")}</TabsTab>
      </TabsList>
    </Tabs>
  );
  return (
    <section className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card/30 p-4">
        {mode === "update" ? (
          <FeatureUpdateComposer
            featureId={featureId}
            projectId={projectId}
            header={composerTabs}
          />
        ) : (
          <>
            {composerTabs}
            <FeatureCommentComposer
              featureId={featureId}
              projectId={projectId}
            />
          </>
        )}
      </div>
      {selectedUpdateId &&
        query.data &&
        (selectedActivity ? (
          <FeatureUpdateCard
            key={selectedUpdateId}
            activity={selectedActivity}
            projectId={projectId}
            onDeleted={() => onUpdateChange?.(undefined)}
          />
        ) : (
          <WorkspaceQueryState
            error={selected.isError}
            onRetry={() => void selected.refetch()}
          />
        ))}
      {query.isPending || (query.isError && !query.data) ? (
        <WorkspaceQueryState
          error={query.isError}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {!query.data?.data.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("tasks:features.workspace.noActivity")}
            </p>
          ) : (
            <Timeline className="gap-4">
              {query.data.data
                .filter(
                  (activity) =>
                    activity.type !== "feature_update" ||
                    activity.id !== selectedUpdateId,
                )
                .map((activity, index) =>
                  activity.type === "feature_update" ? (
                    <FeatureUpdateCard
                      key={activity.id}
                      activity={activity}
                      projectId={projectId}
                    />
                  ) : (
                    <Activity
                      key={activity.id}
                      activity={activity}
                      step={index + 1}
                      subject="feature"
                    />
                  ),
                )}
            </Timeline>
          )}
          <WorkspacePagination
            page={page}
            totalPages={query.data?.pagination.totalPages ?? 0}
            pending={query.isFetching}
            onChange={(next) => void requestLeave(() => setPage(next))}
          />
        </>
      )}
    </section>
  );
}
