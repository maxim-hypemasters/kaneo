import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import type { Team } from "@/fetchers/team/types";
import { useDeleteTeam } from "@/hooks/mutations/team/use-delete-team";
import { toast } from "@/lib/toast";

export function DeleteTeamDialog({
  open,
  onOpenChange,
  team,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const deleteTeam = useDeleteTeam(workspaceId);

  const confirm = async () => {
    if (!team) return;
    try {
      await deleteTeam.mutateAsync(team.id);
      toast.success(t("teams:delete.deleted"));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("teams:delete.error"),
      );
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("teams:delete.title", { name: team?.name ?? "" })}
      description={t("teams:delete.description")}
      confirmLabel={t("teams:delete.confirm")}
      pendingLabel={t("teams:delete.pending")}
      pending={deleteTeam.isPending}
      onConfirm={() => void confirm()}
    />
  );
}
