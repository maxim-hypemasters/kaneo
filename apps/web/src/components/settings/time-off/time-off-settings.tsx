import { useTranslation } from "react-i18next";
import { AutosaveNote } from "@/components/settings/autosave-note";
import { SettingsPage } from "@/components/settings/settings-page";
import { useGetActiveWorkspaceUser } from "@/hooks/queries/workspace-users/use-active-workspace-user";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { DefaultAllowancesSection } from "./default-allowances-section";
import { HolidayDeadlineSection } from "./holiday-deadline-section";
import { MemberAllowancesNote } from "./member-allowances-note";
import { TimeOffSettingsNotAllowed } from "./time-off-settings-not-allowed";

// Time off settings of the active workspace, for approvers. The API checks
// time_off:approve on every read and change.
export function TimeOffSettings() {
  const { t } = useTranslation();
  const { workspace, canApproveTimeOff, isCheckingPermissions } =
    useWorkspacePermission();
  const { isPending: isMemberPending } = useGetActiveWorkspaceUser();
  const checking = !workspace || isCheckingPermissions || isMemberPending;
  const canManage = !checking && canApproveTimeOff();

  if (!checking && !canManage) return <TimeOffSettingsNotAllowed />;

  return (
    <SettingsPage
      title={t("settings:workspaceTimeOff.title")}
      description={
        workspace?.name
          ? t("settings:workspaceTimeOff.description", {
              workspaceName: workspace.name,
            })
          : undefined
      }
      actions={canManage ? <AutosaveNote /> : undefined}
    >
      <div className="space-y-3">
        <DefaultAllowancesSection
          workspaceId={workspace?.id ?? ""}
          enabled={canManage}
        />
        {canManage && workspace ? (
          <MemberAllowancesNote workspaceId={workspace.id} />
        ) : null}
      </div>
      <HolidayDeadlineSection
        workspaceId={workspace?.id ?? ""}
        enabled={canManage}
      />
    </SettingsPage>
  );
}
