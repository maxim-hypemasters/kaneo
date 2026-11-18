import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/settings/row-actions-menu";
import { SettingsCard } from "@/components/settings/settings-card";
import type { Team } from "@/fetchers/team/types";
import { useReplaceTeamMembers } from "@/hooks/mutations/team/use-replace-team-members";
import { toast } from "@/lib/toast";
import { AddTeamMemberButton } from "./add-team-member-button";
import { TeamCardSection } from "./team-card-section";
import {
  type TeamMemberCandidate,
  teamMemberCandidates,
} from "./team-member-candidates";
import { TeamMemberRow } from "./team-member-row";

type WorkspaceMember = Parameters<typeof teamMemberCandidates>[0][number];

export function TeamCard({
  team,
  workspaceId,
  workspaceMembers,
  membersLoading,
  canUpdate,
  canDelete,
  onRename,
  onDelete,
}: {
  team: Team;
  workspaceId: string;
  workspaceMembers: readonly WorkspaceMember[];
  membersLoading: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const replaceMembers = useReplaceTeamMembers(workspaceId);
  const saving = replaceMembers.isPending;
  const memberIds = team.members.map((member) => member.id);
  const memberCandidates: TeamMemberCandidate[] = teamMemberCandidates(
    workspaceMembers,
    memberIds,
  );

  // Each change saves the whole member list. Projects are linked from each
  // project's Overview.
  const saveMembers = async (userIds: string[]) => {
    try {
      await replaceMembers.mutateAsync({ id: team.id, userIds });
      toast.success(t("teams:card.membersSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("teams:card.saveError"),
      );
    }
  };

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
    </SettingsCard>
  );
}
