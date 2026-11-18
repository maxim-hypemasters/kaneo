import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/settings/row-actions-menu";
import { SettingsCard } from "@/components/settings/settings-card";
import type { Team } from "@/fetchers/team/types";
import { useReplaceTeamMembers } from "@/hooks/mutations/team/use-replace-team-members";
import { useReplaceTeamProjects } from "@/hooks/mutations/team/use-replace-team-projects";
import { toast } from "@/lib/toast";
import { AddTeamMemberButton } from "./add-team-member-button";
import { LinkTeamProjectButton } from "./link-team-project-button";
import { TeamCardSection } from "./team-card-section";
import {
  type TeamMemberCandidate,
  teamMemberCandidates,
} from "./team-member-candidates";
import { TeamMemberRow } from "./team-member-row";
import { teamProjectCandidates } from "./team-project-candidates";
import { TeamProjectRow } from "./team-project-row";

type WorkspaceMember = Parameters<typeof teamMemberCandidates>[0][number];
type ProjectOption = { id: string; name: string; icon?: string | null };

export function TeamCard({
  team,
  workspaceId,
  workspaceMembers,
  membersLoading,
  projects,
  projectsLoading,
  canUpdate,
  canDelete,
  onRename,
  onDelete,
}: {
  team: Team;
  workspaceId: string;
  workspaceMembers: readonly WorkspaceMember[];
  membersLoading: boolean;
  projects: readonly ProjectOption[];
  projectsLoading: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const replaceMembers = useReplaceTeamMembers(workspaceId);
  const replaceProjects = useReplaceTeamProjects(workspaceId);
  const saving = replaceMembers.isPending || replaceProjects.isPending;
  const memberIds = team.members.map((member) => member.id);
  const projectIds = team.projects.map((project) => project.id);
  const memberCandidates: TeamMemberCandidate[] = teamMemberCandidates(
    workspaceMembers,
    memberIds,
  );

  // Each change saves the whole list. The API keeps links to projects the
  // viewer can't see, which this card never lists.
  const save = async (change: () => Promise<unknown>, success: string) => {
    try {
      await change();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("teams:card.saveError"),
      );
    }
  };
  const saveMembers = (userIds: string[]) =>
    save(
      () => replaceMembers.mutateAsync({ id: team.id, userIds }),
      t("teams:card.membersSaved"),
    );
  const saveProjects = (next: string[]) =>
    save(
      () => replaceProjects.mutateAsync({ id: team.id, projectIds: next }),
      t("teams:card.projectsSaved"),
    );

  const actions: RowAction[] = [
    ...(canUpdate
      ? [
          {
            id: "rename",
            label: t("teams:card.rename"),
            icon: PencilIcon,
            onSelect: onRename,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            id: "delete",
            label: t("teams:card.delete"),
            icon: Trash2Icon,
            onSelect: onDelete,
            destructive: true,
          },
        ]
      : []),
  ];

  return (
    <SettingsCard>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{team.name}</h2>
          <p className="text-xs text-muted-foreground">
            {t("teams:card.memberCount", { count: team.members.length })}
            {" · "}
            {t("teams:card.projectCount", { count: team.projects.length })}
          </p>
        </div>
        {actions.length > 0 ? (
          <RowActionsMenu
            label={t("teams:card.actions", { name: team.name })}
            actions={actions}
          />
        ) : null}
      </div>
      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <TeamCardSection
          title={t("teams:card.members")}
          empty={team.members.length === 0 ? t("teams:card.noMembers") : null}
          action={
            canUpdate ? (
              <AddTeamMemberButton
                candidates={memberCandidates}
                loading={membersLoading}
                disabled={saving}
                onAdd={(userId) => void saveMembers([...memberIds, userId])}
              />
            ) : null
          }
        >
          {team.members.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              canEdit={canUpdate}
              disabled={saving}
              onRemove={() =>
                void saveMembers(memberIds.filter((id) => id !== member.id))
              }
            />
          ))}
        </TeamCardSection>
        <TeamCardSection
          title={t("teams:card.projects")}
          empty={team.projects.length === 0 ? t("teams:card.noProjects") : null}
          action={
            canUpdate ? (
              <LinkTeamProjectButton
                candidates={teamProjectCandidates(projects, projectIds)}
                loading={projectsLoading}
                disabled={saving}
                onLink={(projectId) =>
                  void saveProjects([...projectIds, projectId])
                }
              />
            ) : null
          }
        >
          {team.projects.map((project) => (
            <TeamProjectRow
              key={project.id}
              project={project}
              canEdit={canUpdate}
              disabled={saving}
              onUnlink={() =>
                void saveProjects(projectIds.filter((id) => id !== project.id))
              }
            />
          ))}
        </TeamCardSection>
      </div>
    </SettingsCard>
  );
}
