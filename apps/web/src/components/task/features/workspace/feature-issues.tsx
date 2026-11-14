import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import { useUpdateTaskFeature } from "@/hooks/mutations/task/use-update-task-feature";
import { useFeatureIssues } from "@/hooks/queries/feature/use-feature-issues";
import { useGetMilestones } from "@/hooks/queries/milestone/use-get-milestones";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { useMilestoneSelection } from "../../milestones/milestone-selection-context";
import { useToggleTaskCompletion } from "../../use-toggle-task-completion";
import { taskReleaseSearch } from "../../task-release-origin";
import { useTaskReleaseOrigin } from "../../task-release-origin-context";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";
import { featureIssueTask } from "./feature-issue-task";
import { FeatureIssueGroups } from "./feature-issue-groups";
import { FeatureIssuesToolbar } from "./feature-issues-toolbar";
import { FeatureIssuesLink } from "./feature-issues-link";
import { WorkspaceDeleteDialog } from "./workspace-delete-dialog";
import { WorkspacePagination } from "./workspace-pagination";
import { WorkspaceQueryState } from "./workspace-query-state";

type Props = {
  featureId: string;
  featureTitle: string;
  projectId: string;
  workspaceId: string;
};

export function FeatureIssues(props: Props) {
  const { filter, setFilter } = useMilestoneSelection();
  const milestones = useGetMilestones(props.projectId, props.featureId);
  useEffect(() => {
    if (
      typeof filter === "object" &&
      milestones.isSuccess &&
      !milestones.data.some((milestone) => milestone.id === filter.id)
    )
      setFilter("all");
  }, [filter, milestones.data, milestones.isSuccess, setFilter]);
  const milestoneId =
    filter === "all" ? undefined : filter === "none" ? "none" : filter.id;
  return (
    <FeatureIssueList
      key={`${props.featureId}:${milestoneId ?? "all"}`}
      {...props}
      milestoneId={milestoneId}
    />
  );
}

function FeatureIssueList({
  featureId,
  featureTitle,
  projectId,
  workspaceId,
  milestoneId,
}: Props & { milestoneId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const origin = useTaskReleaseOrigin();
  const client = useQueryClient();
  const permission = useWorkspacePermission();
  // Linking and completing work edits tasks or bugs; the API checks each
  // row's own type.
  const canEdit = permission.canUpdateTasks() || permission.canUpdateBugs();
  const createTypes = (["task", "bug"] as const).filter((type) =>
    permission.canWorkItem(type, "create"),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState(new Map<string, Task>());
  const [createType, setCreateType] = useState<"task" | "bug" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useDocumentDraftGuard({ dirty: false, saving, onDiscard: () => {} });
  const issues = useFeatureIssues(projectId, featureId, {
    search,
    page,
    milestoneId,
    archived: archived ? "include" : "exclude",
  });
  const remove = useUpdateTaskFeature();
  const deletion = useDeleteTask();
  const complete = useToggleTaskCompletion();
  const data = issues.data;
  const tasks = data?.data.map(featureIssueTask) ?? [];

  const refresh = () =>
    client.invalidateQueries({
      queryKey: featureWorkspaceKey(projectId, featureId),
    });
  const perform = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:features.workspace.issues.linkFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="min-w-0 space-y-4"
      aria-label={t("tasks:features.workspace.issues.title")}
    >
      <FeatureIssuesToolbar
        search={search}
        archived={archived}
        selectedCount={selected.size}
        createTypes={createTypes}
        canEdit={canEdit}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onArchived={(value) => {
          setArchived(value);
          setPage(1);
        }}
        onCreate={setCreateType}
        onLink={() => setLinkOpen(true)}
        onClearSelection={() => setSelected(new Map())}
      />
      {!data ? (
        <WorkspaceQueryState
          error={issues.isError}
          onRetry={() => void issues.refetch()}
        />
      ) : (
        <>
          {issues.isError && (
            <WorkspaceQueryState error onRetry={() => void issues.refetch()} />
          )}
          <FeatureIssueGroups
            groups={data.groups}
            tasks={tasks}
            selected={selected}
            canEdit={canEdit && !saving}
            projectId={projectId}
            workspaceId={workspaceId}
            onSelect={(task, checked) =>
              setSelected((current) => {
                const next = new Map(current);
                if (checked) next.set(task.id, task);
                else next.delete(task.id);
                return next;
              })
            }
            onComplete={(task) => void perform(() => complete(task))}
            onOpen={(task) => {
              void navigate({
                to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
                params: { workspaceId, projectId, taskId: task.id },
                search: taskReleaseSearch(origin, projectId),
              });
            }}
            onDelete={(task) => setDeleteId(task.id)}
            onRemove={(task) =>
              void perform(() => remove.mutateAsync({ task, featureId: null }))
            }
          />
          {tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("tasks:features.workspace.issues.empty")}
            </p>
          )}
          <WorkspacePagination
            page={page}
            totalPages={data.pagination.totalPages}
            pending={issues.isFetching}
            onChange={setPage}
          />
        </>
      )}
      {createType && (
        <CreateTaskModal
          open
          onClose={() => {
            setCreateType(null);
            void refresh();
          }}
          projectId={projectId}
          type={createType}
          initialFeature={{ id: featureId, title: featureTitle }}
          initialMilestoneId={milestoneId === "none" ? undefined : milestoneId}
          originReleaseId={
            origin?.projectId === projectId ? origin.releaseId : undefined
          }
        />
      )}
      {linkOpen && (
        <FeatureIssuesLink
          projectId={projectId}
          featureId={featureId}
          milestoneId={milestoneId === "none" ? undefined : milestoneId}
          onClose={() => setLinkOpen(false)}
        />
      )}
      <WorkspaceDeleteDialog
        open={deleteId !== null}
        title={t("tasks:subtasks.deleteDialogTitle")}
        description={t("tasks:subtasks.deleteDialogDescription")}
        pending={deletion.isPending}
        failed={deletion.isError}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={() => {
          if (deleteId)
            void perform(async () => {
              await deletion.mutateAsync(deleteId);
              setSelected((current) => {
                const next = new Map(current);
                next.delete(deleteId);
                return next;
              });
              setDeleteId(null);
            });
        }}
      />
    </section>
  );
}
