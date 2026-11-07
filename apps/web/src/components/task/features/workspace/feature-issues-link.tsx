import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { setTaskMilestone } from "@/fetchers/milestone/milestones";
import type { FeatureLinkCandidate } from "@/fetchers/task/get-feature-link-candidates";
import { useUpdateTaskFeature } from "@/hooks/mutations/task/use-update-task-feature";
import { useFeatureLinkCandidates } from "@/hooks/queries/task/use-feature-link-candidates";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import { WorkspacePagination } from "./workspace-pagination";
import { WorkspaceQueryState } from "./workspace-query-state";

type Retry = { candidate: FeatureLinkCandidate; linked: boolean };

export function FeatureIssuesLink({
  projectId,
  featureId,
  milestoneId,
  onClose,
}: {
  projectId: string;
  featureId: string;
  milestoneId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  useDocumentDraftGuard({ dirty: false, saving: pending, onDiscard: () => {} });
  const [retry, setRetry] = useState<Retry | null>(null);
  const candidates = useFeatureLinkCandidates(projectId, search, page, true);
  const assignment = useUpdateTaskFeature();

  const link = async (candidate: FeatureLinkCandidate, linked = false) => {
    setPending(true);
    let featureLinked = linked;
    try {
      if (!featureLinked) {
        await assignment.mutateAsync({
          task: { id: candidate.id, projectId, featureId: null },
          featureId,
        });
        featureLinked = true;
      }
      if (milestoneId) await setTaskMilestone(candidate.id, milestoneId);
      invalidateFeatureChange(client, projectId, [candidate.id, featureId]);
      setRetry(null);
      onClose();
    } catch {
      setRetry({ candidate, linked: featureLinked });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-xl" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>
            {t("tasks:features.workspace.issues.linkExisting")}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto px-6 pb-6">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            disabled={pending}
            placeholder={t("tasks:features.workspace.issues.search")}
            aria-label={t("tasks:features.workspace.issues.search")}
            autoFocus
          />
          {retry && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm text-destructive"
            >
              <span>{t("tasks:features.workspace.issues.linkFailed")}</span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => void link(retry.candidate, retry.linked)}
              >
                {t("common:error.tryAgain")}
              </Button>
            </div>
          )}
          {!candidates.data ? (
            <WorkspaceQueryState
              error={candidates.isError}
              onRetry={() => void candidates.refetch()}
            />
          ) : (
            <>
              {candidates.isError && (
                <WorkspaceQueryState
                  error
                  onRetry={() => void candidates.refetch()}
                />
              )}
              <div className="divide-y rounded-lg border">
                {candidates.data.data.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={pending}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-3 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    onClick={() => void link(candidate)}
                  >
                    <TaskTypeGlyph type={candidate.type} decorative />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground">
                        {candidate.number === null
                          ? null
                          : `${candidate.projectSlug}-${candidate.number}`}
                      </span>
                      <p className="truncate" title={candidate.title}>
                        {candidate.title}
                      </p>
                    </div>
                    <span
                      className="max-w-32 truncate text-xs text-muted-foreground"
                      title={candidate.releaseName ?? undefined}
                    >
                      {candidate.releaseName ?? t("tasks:releases.noRelease")}
                    </span>
                  </button>
                ))}
                {candidates.data.data.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {t("tasks:features.workspace.issues.noCandidates")}
                  </p>
                )}
              </div>
              <WorkspacePagination
                page={page}
                totalPages={candidates.data.pagination.totalPages}
                pending={pending || candidates.isFetching}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
