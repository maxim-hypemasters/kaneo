import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import { useSetTeamProjectLink } from "@/hooks/mutations/team/use-set-team-project-link";
import { useGetTeams } from "@/hooks/queries/team/use-get-teams";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { LinkProjectTeamButton } from "./link-project-team-button";
import { ProjectTeamRow } from "./project-team-row";
import { teamsLinkedToProject } from "./teams-linked-to-project";

// Members of a linked team can open the project even when their own project
// access is limited to selected projects.
export function ProjectTeamsCard({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const teams = useGetTeams(workspaceId);
  const { canUpdateTeams, isCheckingPermissions } = useWorkspacePermission();
  const canEdit = !isCheckingPermissions && canUpdateTeams();
  const setLink = useSetTeamProjectLink(workspaceId);
  const all = teams.data ?? [];
  const linked = teamsLinkedToProject(all, projectId);
  const candidates = all.filter((team) => !linked.includes(team));

  const save = async (teamId: string, linkedNow: boolean) => {
    try {
      await setLink.mutateAsync({ teamId, projectId, linked: linkedNow });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("teams:projectTeams.saveError"),
      );
    }
  };

  return (
    <RailCard title={t("teams:projectTeams.title")} count={linked.length}>
      {linked.length > 0 ? (
        <ul className="flex flex-col">
          {linked.map((team) => (
            <ProjectTeamRow
              key={team.id}
              team={team}
              canEdit={canEdit}
              disabled={setLink.isPending}
              onUnlink={() => void save(team.id, false)}
            />
          ))}
        </ul>
      ) : canEdit ? null : (
        <p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-[13px]">
          {t("teams:projectTeams.none")}
        </p>
      )}
      {canEdit ? (
        <LinkProjectTeamButton
          candidates={candidates}
          hasTeams={all.length > 0}
          loading={teams.isPending}
          disabled={setLink.isPending}
          onLink={(teamId) => void save(teamId, true)}
        />
      ) : null}
    </RailCard>
  );
}
