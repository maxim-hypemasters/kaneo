import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useState } from "react";
import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { useGetMilestones } from "@/hooks/queries/milestone/use-get-milestones";
import { useMilestoneMutations } from "@/hooks/mutations/milestone/use-milestone-mutations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { SectionHeader } from "../sections/section-header";
import { SectionAddButton } from "../sections/section-add-button";
import { MilestoneDialog } from "./milestone-dialog";
import { MilestoneRow } from "./milestone-row";
export type MilestoneFilter = "all" | "none" | { id: string };
export function FeatureMilestones({
  projectId,
  featureId,
  filter,
  onFilter,
}: {
  projectId: string;
  featureId: string;
  filter: MilestoneFilter;
  onFilter: (filter: MilestoneFilter) => void;
}) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const { data: workspace } = useActiveWorkspace();
  const { data: columns = [] } = useGetColumns(projectId);
  const { data: releases = [] } = useGetReleases(projectId);
  const { data: members = [] } = useGetProjectMembers({
    projectId,
    workspaceId: workspace?.id ?? "",
  });
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useGetMilestones(projectId, featureId);
  const mutations = useMilestoneMutations(projectId, featureId);
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const move = async (index: number, direction: -1 | 1) => {
    const ids = data.map((m) => m.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    try {
      await mutations.reorder.mutateAsync(ids);
    } catch {
      toast.error(t("tasks:milestones.saveError"));
    }
  };
  return (
    <section
      aria-label={t("tasks:milestones.title")}
      className="flex flex-col gap-1"
    >
      <SectionHeader
        title={t("tasks:milestones.title")}
        action={
          canEdit && (
            <SectionAddButton
              aria-label={t("tasks:milestones.add")}
              onClick={() => setEditing("new")}
            />
          )
        }
      />
      {isPending && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {t("tasks:milestones.loading")}
        </p>
      )}
      {isError && (
        <div role="alert" className="flex items-center gap-2 px-2 text-xs">
          <p>{t("tasks:milestones.loadError")}</p>
          <Button size="xs" variant="ghost" onClick={() => void refetch()}>
            {t("common:error.tryAgain")}
          </Button>
        </div>
      )}
      {!isPending && !isError && data.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {t("tasks:milestones.empty")}
        </p>
      )}
      {data.map((m, index) => (
        <MilestoneRow
          key={m.id}
          milestone={m}
          projectId={projectId}
          planningLabel={[
            getStatusDisplayLabel(
              m.status ?? "planned",
              columns.find((c) => c.slug === m.status)?.name,
            ),
            members.find((member) => member.id === m.leadId)?.name,
            releases.find((release) => release.id === m.releaseId)?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
          selected={typeof filter === "object" && filter.id === m.id}
          canEdit={canEdit}
          first={index === 0}
          last={index === data.length - 1}
          pending={mutations.reorder.isPending}
          onSelect={() =>
            onFilter(
              typeof filter === "object" && filter.id === m.id
                ? "all"
                : { id: m.id },
            )
          }
          onEdit={() => setEditing(m)}
          onDelete={() => {
            setDeleteError(false);
            setDeleting(m);
          }}
          onMove={(direction) => void move(index, direction)}
        />
      ))}
      <button
        type="button"
        aria-pressed={filter === "none"}
        onClick={() => onFilter(filter === "none" ? "all" : "none")}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
          filter === "none" && "bg-accent/50 text-foreground",
        )}
      >
        <Diamond
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeDasharray="2 3"
        />
        <span className="min-w-0 flex-1 truncate">
          {t("tasks:milestones.none")}
        </span>
      </button>
      {editing && (
        <MilestoneDialog
          projectId={projectId}
          featureId={featureId}
          milestone={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !mutations.remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks:milestones.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks:milestones.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p role="alert">{t("tasks:milestones.saveError")}</p>}
          <AlertDialogFooter>
            <AlertDialogClose
              render={
                <Button
                  variant="outline"
                  disabled={mutations.remove.isPending}
                />
              }
            >
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={mutations.remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await mutations.remove.mutateAsync(deleting.id);
                  if (typeof filter === "object" && filter.id === deleting.id)
                    onFilter("all");
                  setDeleting(null);
                } catch {
                  setDeleteError(true);
                }
              }}
            >
              {t("tasks:milestones.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
