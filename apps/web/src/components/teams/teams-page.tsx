import { Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { Button } from "@/components/ui/button";
import type { Team } from "@/fetchers/team/types";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useGetTeams } from "@/hooks/queries/team/use-get-teams";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { DeleteTeamDialog } from "./delete-team-dialog";
import { TeamCard } from "./team-card";
import { TeamNameDialog } from "./team-name-dialog";
import { TeamsListSkeleton } from "./teams-list-skeleton";
import { useTeamPermissions } from "./use-team-permissions";

export function TeamsPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const teams = useGetTeams(workspaceId);
  const { canCreate, canUpdate, canDelete } = useTeamPermissions();
  const workspaceMembers = useGetActiveWorkspaceUsers(workspaceId);
  const projects = useGetProjects({ workspaceId, enabled: canUpdate });
  // Each dialog keeps its team after closing, for the exit animation.
  const [nameOpen, setNameOpen] = useState(false);
  const [renaming, setRenaming] = useState<Team | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);

  const openCreate = () => {
    setRenaming(null);
    setNameOpen(true);
  };

  let content = <TeamsListSkeleton />;
  if (teams.isError) {
    content = (
      <SettingsCard>
        <SettingsEmpty
          icon={<UsersRound />}
          title={t("teams:page.loadError")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void teams.refetch()}
            >
              {t("teams:page.retry")}
            </Button>
          }
        />
      </SettingsCard>
    );
  } else if (teams.data && teams.data.length === 0) {
    content = (
      <SettingsCard>
        <SettingsEmpty
          icon={<UsersRound />}
          title={t("teams:page.emptyTitle")}
          description={t(
            canCreate
              ? "teams:page.emptyDescription"
              : "teams:page.emptyReadOnly",
          )}
          action={
            canCreate ? (
              <Button type="button" size="sm" onClick={openCreate}>
                <Plus aria-hidden="true" />
                {t("teams:page.newTeam")}
              </Button>
            ) : null
          }
        />
      </SettingsCard>
    );
  } else if (teams.data) {
    content = (
      <div className="space-y-4">
        {teams.data.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            workspaceId={workspaceId}
            workspaceMembers={workspaceMembers.data?.members ?? []}
            membersLoading={workspaceMembers.isPending}
            projects={projects.data ?? []}
            projectsLoading={projects.isPending}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onRename={() => {
              setRenaming(team);
              setNameOpen(true);
            }}
            onDelete={() => {
              setDeleting(team);
              setDeleteOpen(true);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <WorkspaceLayout
      title={t("teams:page.title")}
      headerActions={
        canCreate ? (
          <Button
            variant="outline"
            size="xs"
            onClick={openCreate}
            className="gap-1"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t("teams:page.newTeam")}
          </Button>
        ) : null
      }
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            {t("teams:page.description")}
          </p>
          {content}
        </div>
      </div>
      <TeamNameDialog
        open={nameOpen}
        onOpenChange={setNameOpen}
        team={renaming}
        workspaceId={workspaceId}
      />
      <DeleteTeamDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        team={deleting}
        workspaceId={workspaceId}
      />
    </WorkspaceLayout>
  );
}
