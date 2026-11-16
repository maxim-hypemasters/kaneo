import { useParams } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { SettingsNote } from "@/components/settings/settings-note";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { useReplaceTriageMembers } from "@/hooks/mutations/triage/use-replace-triage-members";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetTriageMembers } from "@/hooks/queries/triage/use-get-triage-members";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { AddTriageMemberButton } from "./add-triage-member-button";
import { TriageMemberRow } from "./triage-member-row";

export function ProjectTriagePage() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams({ strict: false });
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const { data: memberIds = [], isPending } = useGetTriageMembers(projectId);
  const people = useGetProjectMembers({ workspaceId, projectId });
  const { canUpdateProjects, isCheckingPermissions } = useWorkspacePermission();
  const canEdit = !isCheckingPermissions && canUpdateProjects();
  const replace = useReplaceTriageMembers(projectId);

  // Saves on every change; the API rejects people who can't see the project.
  const save = async (next: string[]) => {
    try {
      await replace.mutateAsync(next);
      toast.success(t("settings:projectTriage.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectTriage.saveError"),
      );
    }
  };

  const byId = new Map(
    (people.data ?? []).map((person) => [person.id, person]),
  );
  const candidates = (people.data ?? []).filter(
    (person) => !memberIds.includes(person.id),
  );

  return (
    <>
      <PageTitle title={t("settings:projectTriage.pageTitle")} />
      <SettingsPage
        title={t("settings:projectTriage.title")}
        description={
          project?.name
            ? t("settings:projectTriage.subtitle", { project: project.name })
            : undefined
        }
      >
        <SettingsSection
          title={t("settings:projectTriage.membersTitle")}
          description={t("settings:projectTriage.membersDescription")}
          action={
            canEdit ? (
              <AddTriageMemberButton
                candidates={candidates}
                loading={people.isPending}
                disabled={replace.isPending}
                onAdd={(userId) => void save([...memberIds, userId])}
              />
            ) : null
          }
        >
          <SettingsCard>
            {!isPending && memberIds.length === 0 ? (
              <SettingsEmpty
                icon={<Inbox />}
                title={t("settings:projectTriage.emptyTitle")}
                description={t("settings:projectTriage.emptyDescription")}
              />
            ) : (
              memberIds.map((userId) => {
                const person = byId.get(userId);
                const name =
                  person?.name ||
                  person?.email ||
                  t("settings:projectTriage.unknownMember");
                return (
                  <TriageMemberRow
                    key={userId}
                    name={name}
                    email={person?.email}
                    image={person?.image}
                    canEdit={canEdit}
                    disabled={replace.isPending}
                    onRemove={() =>
                      void save(memberIds.filter((id) => id !== userId))
                    }
                  />
                );
              })
            )}
          </SettingsCard>
          <SettingsNote>
            {canEdit
              ? t("settings:projectTriage.rule")
              : t("settings:projectTriage.readOnly")}
          </SettingsNote>
        </SettingsSection>
      </SettingsPage>
    </>
  );
}
