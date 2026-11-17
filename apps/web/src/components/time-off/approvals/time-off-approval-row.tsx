import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PendingTimeOffRequest } from "@/fetchers/time-off/types";
import { useApproveTimeOffRequest } from "@/hooks/mutations/time-off/use-approve-time-off-request";
import { useDeclineTimeOffRequest } from "@/hooks/mutations/time-off/use-decline-time-off-request";
import { cn } from "@/lib/cn";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { timeOffErrorCode } from "@/lib/time-off/time-off-error-key";
import { toast } from "@/lib/toast";
import type { TimelineMember } from "../timeline/timeline-members";
import { TIME_OFF_TYPE_STYLES } from "../time-off-type-styles";

type TimeOffApprovalRowProps = {
  workspaceId: string;
  request: PendingTimeOffRequest;
  // Missing while the member list doesn't include the requester.
  member?: TimelineMember;
  isViewer: boolean;
  today: string;
  // The request was decided, by this approver or someone else, and leaves the
  // list.
  onDecided?: () => void;
};

type Decision = "approve" | "decline";

const SUCCESS_KEYS = {
  approve: "team:timeOff.approvals.approved",
  decline: "team:timeOff.approvals.declined",
} as const satisfies Record<Decision, string>;

export function TimeOffApprovalRow({
  workspaceId,
  request,
  member,
  isViewer,
  today,
  onDecided,
}: TimeOffApprovalRowProps) {
  const { t } = useTranslation();
  const approve = useApproveTimeOffRequest(workspaceId);
  const decline = useDeclineTimeOffRequest(workspaceId);
  const name = member?.name || t("common:people.unknown");
  const style = TIME_OFF_TYPE_STYLES[request.type];
  const Icon = style.icon;
  const range = formatReleaseRange(request.startDate, request.endDate, {
    today,
  });
  const overYears = request.overAllowanceDays.filter((year) => year.days > 0);
  const busy = approve.isPending || decline.isPending;

  // Both mutations refetch every time-off query when they settle, so after a
  // 409 the list already shows the request as it is now.
  const decide = async (decision: Decision) => {
    const mutation = decision === "approve" ? approve : decline;
    try {
      // The version the approver is looking at: an edit since then is
      // rejected instead of deciding dates they haven't seen.
      await mutation.mutateAsync({ id: request.id, version: request.version });
      toast.success(t(SUCCESS_KEYS[decision], { name }));
      onDecided?.();
    } catch (error) {
      const code = timeOffErrorCode(error);
      if (code === "TIME_OFF_CHANGED") {
        toast.error(t("team:timeOff.approvals.changed"));
      } else if (code === "TIME_OFF_STATUS") {
        toast.error(t("team:timeOff.approvals.alreadyDecided"));
        onDecided?.();
      } else {
        toast.error(errorMessage(error, t("team:timeOff.approvals.error")));
      }
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b px-3 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AssigneeAvatar
          assigned
          name={member?.name}
          image={member?.image}
          className="mt-0.5 size-7"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-medium" title={name}>
              {name}
            </span>
            {isViewer ? (
              <span className="shrink-0 text-muted-foreground text-xs">
                {t("team:timeOff.you")}
              </span>
            ) : null}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
            <span className="font-medium text-foreground tabular-nums">
              {range}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {t("team:timeOff.weekdays", { count: request.days })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Icon
                aria-hidden="true"
                className={cn("size-3.5", style.iconClassName)}
              />
              {t(style.labelKey)}
            </span>
          </p>
          {request.note ? (
            <p className="whitespace-pre-wrap break-words border-s-2 ps-2 text-xs">
              <span className="sr-only">{t("team:timeOff.details.note")} </span>
              {request.note}
            </p>
          ) : null}
          {overYears.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {overYears.map((year) => (
                <Badge key={year.year} variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  {t("team:timeOff.approvals.overAllowance", {
                    count: year.days,
                    year: year.year,
                  })}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {request.canDecide ? (
        <div className="flex shrink-0 justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={decline.isPending}
            disabled={busy}
            aria-label={t("team:timeOff.approvals.declineFor", {
              name,
              range,
            })}
            onClick={() => void decide("decline")}
          >
            {t("team:timeOff.approvals.decline")}
          </Button>
          <Button
            size="sm"
            loading={approve.isPending}
            disabled={busy}
            aria-label={t("team:timeOff.approvals.approveFor", {
              name,
              range,
            })}
            onClick={() => void decide("approve")}
          >
            {t("team:timeOff.approvals.approve")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
