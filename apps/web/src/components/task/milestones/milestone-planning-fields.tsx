import { MilestonePlanningChoice } from "./milestone-planning-choice";
import { useTranslation } from "react-i18next";
import type {
  Milestone,
  MilestoneInput,
} from "@/fetchers/milestone/milestones";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getPriorityIcon } from "@/lib/priority";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";
import { getColumnIcon } from "@/lib/column";
import { assigneeMenuOptions } from "../menus/assignee-menu-options";
import { MilestoneScheduleDates } from "./milestone-schedule-dates";

export function MilestonePlanningFields({
  projectId,
  workspaceId,
  milestone,
  onChange,
  pending = false,
}: {
  projectId: string;
  workspaceId: string;
  milestone: Pick<
    Milestone,
    "leadId" | "status" | "priority" | "releaseId" | "startDate" | "endDate"
  >;
  onChange: (input: MilestoneInput) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const permission = useWorkspacePermission();
  const releases = useGetReleases(projectId);
  const members = useGetProjectMembers({ projectId, workspaceId });
  const canEdit = permission.canUpdateTasks() && !pending;
  const lead = members.data?.find((m) => m.id === milestone.leadId);
  const release = releases.data?.find((r) => r.id === milestone.releaseId);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MilestonePlanningChoice
        label={t("tasks:milestones.lead")}
        disabled={!canEdit || !permission.canAssignTasks()}
        options={assigneeMenuOptions(
          members.data ?? [],
          milestone.leadId,
          t("tasks:popover.assignee.unassigned"),
        )}
        loading={members.isPending}
        error={members.isError}
        onRetry={() => void members.refetch()}
        onSelect={(value) => onChange({ leadId: value || null })}
      >
        {lead?.name ??
          (milestone.leadId
            ? t(
                members.isPending
                  ? "common:empty.loading"
                  : "common:people.unknown",
              )
            : t("tasks:popover.assignee.unassigned"))}
      </MilestonePlanningChoice>
      <dl className="min-w-0 space-y-1.5 text-sm">
        <dt>{t("tasks:status.label")}</dt>
        <dd
          aria-label={t("tasks:status.label")}
          className="flex min-h-9 items-center gap-2"
        >
          {milestone.status
            ? getColumnIcon(milestone.status, milestone.status === "done")
            : null}
          {milestone.status
            ? getStatusDisplayLabel(milestone.status)
            : t("common:empty.loading")}
        </dd>
      </dl>
      <MilestonePlanningChoice
        label={t("tasks:priority.label")}
        disabled={!canEdit}
        options={["no-priority", "low", "medium", "high", "urgent"].map(
          (priority) => ({
            value: priority,
            label: getPriorityLabel(priority),
            icon: getPriorityIcon(priority),
            selected: priority === milestone.priority,
          }),
        )}
        onSelect={(priority) =>
          onChange({ priority: priority as Milestone["priority"] })
        }
      >
        {getPriorityIcon(milestone.priority ?? "no-priority")}
        {getPriorityLabel(milestone.priority ?? "no-priority")}
      </MilestonePlanningChoice>
      <MilestonePlanningChoice
        label={t("tasks:releases.property")}
        disabled={!canEdit}
        options={[
          {
            value: "",
            label: t("tasks:releases.none"),
            selected: !milestone.releaseId,
          },
          ...(releases.data ?? []).map((release) => ({
            value: release.id,
            label: release.name,
            selected: release.id === milestone.releaseId,
          })),
        ]}
        loading={releases.isPending}
        error={releases.isError}
        onRetry={() => void releases.refetch()}
        onSelect={(value) => onChange({ releaseId: value || null })}
      >
        {release?.name ??
          t(
            milestone.releaseId
              ? "tasks:releases.unknown"
              : "tasks:releases.none",
          )}
      </MilestonePlanningChoice>
      <MilestoneScheduleDates
        startDate={milestone.startDate}
        endDate={milestone.endDate}
      />
    </div>
  );
}
