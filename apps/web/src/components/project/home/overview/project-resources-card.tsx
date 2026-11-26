import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import { errorMessage } from "@/components/project/error-message";
import { toPositions } from "@/components/project/sortable/apply-order";
import { SortableList } from "@/components/project/sortable/sortable-list";
import { useSortableOrder } from "@/components/project/sortable/use-sortable-order";
import { Button } from "@/components/ui/button";
import type { ProjectLink } from "@/fetchers/project-link/types";
import { useDeleteProjectLink } from "@/hooks/mutations/project-link/use-delete-project-link";
import { useReorderProjectLinks } from "@/hooks/mutations/project-link/use-reorder-project-links";
import { useProjectLinks } from "@/hooks/queries/project-link/use-project-links";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { ProjectResourceDialog } from "./project-resource-dialog";
import { ProjectResourceRow } from "./project-resource-row";

const NO_LINKS: ProjectLink[] = [];

// Links the project needs at hand. Everyone with access to the project opens
// them; whoever may edit the name and description manages them.
export function ProjectResourcesCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const links = useProjectLinks(projectId);
  const { canEditProjectDetails, isCheckingPermissions } =
    useWorkspacePermission();
  const canEdit = !isCheckingPermissions && canEditProjectDetails();
  const reorderLinks = useReorderProjectLinks(projectId);
  const deleteLink = useDeleteProjectLink(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Kept while the dialog closes, so its title doesn't flip mid-animation.
  const [editing, setEditing] = useState<ProjectLink | null>(null);

  const { ordered, move } = useSortableOrder(
    links.data ?? NO_LINKS,
    async (next) => {
      try {
        await reorderLinks.mutateAsync(toPositions(next));
      } catch (error) {
        toast.error(
          errorMessage(error, t("tasks:projectHome.resources.reorderError")),
        );
      }
    },
  );

  const openDialog = (link: ProjectLink | null) => {
    setEditing(link);
    setDialogOpen(true);
  };

  const remove = async (id: string) => {
    try {
      await deleteLink.mutateAsync(id);
    } catch (error) {
      toast.error(
        errorMessage(error, t("tasks:projectHome.resources.removeError")),
      );
    }
  };

  return (
    <RailCard
      title={t("tasks:projectHome.resources.title")}
      count={ordered.length}
    >
      {ordered.length > 0 ? (
        <ul className="flex flex-col">
          <SortableList ids={ordered.map((link) => link.id)} onMove={move}>
            {ordered.map((link) => (
              <ProjectResourceRow
                key={link.id}
                link={link}
                canEdit={canEdit}
                disabled={deleteLink.isPending}
                onEdit={() => openDialog(link)}
                onRemove={() => void remove(link.id)}
              />
            ))}
          </SortableList>
        </ul>
      ) : links.isError ? (
        <p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-[13px]">
          {t("tasks:projectHome.resources.loadError")}
        </p>
      ) : canEdit || links.isPending ? null : (
        <p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-[13px]">
          {t("tasks:projectHome.resources.none")}
        </p>
      )}
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start px-2 font-normal text-muted-foreground"
            onClick={() => openDialog(null)}
          >
            <Plus aria-hidden="true" />
            {t("tasks:projectHome.resources.add")}
          </Button>
          <ProjectResourceDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            link={editing}
            projectId={projectId}
          />
        </>
      ) : null}
    </RailCard>
  );
}
