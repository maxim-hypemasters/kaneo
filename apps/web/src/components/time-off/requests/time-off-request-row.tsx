import { PencilIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/settings/row-actions-menu";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { TimeOffStatusBadge } from "../time-off-status-badge";
import { TIME_OFF_TYPE_STYLES } from "../time-off-type-styles";

type TimeOffRequestRowProps = {
  request: TimeOffRequest;
  today: string;
  onEdit: (request: TimeOffRequest) => void;
  onCancel: (request: TimeOffRequest) => void;
};

// The server decides what each request allows (canEdit, canCancel), so the
// menu offers only what will succeed.
export function TimeOffRequestRow({
  request,
  today,
  onEdit,
  onCancel,
}: TimeOffRequestRowProps) {
  const { t } = useTranslation();
  const style = TIME_OFF_TYPE_STYLES[request.type];
  const Icon = style.icon;
  const range = formatReleaseRange(request.startDate, request.endDate, {
    today,
  });
  const actions: RowAction[] = [];
  if (request.canEdit) {
    actions.push({
      id: "edit",
      label: t("team:timeOff.requests.edit"),
      icon: PencilIcon,
      onSelect: () => onEdit(request),
    });
  }
  if (request.canCancel) {
    actions.push({
      id: "cancel",
      label: t("team:timeOff.requests.cancel"),
      icon: XIcon,
      destructive: true,
      onSelect: () => onCancel(request),
    });
  }
  const finished =
    request.status === "declined" || request.status === "cancelled";

  return (
    <li className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", style.iconClassName)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className={cn(
            "font-medium text-sm tabular-nums",
            finished && "text-muted-foreground line-through",
          )}
        >
          {range}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
          <span className="shrink-0">{t(style.labelKey)}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">
            {t("team:timeOff.weekdays", { count: request.days })}
          </span>
          {request.note ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate" title={request.note}>
                {request.note}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <TimeOffStatusBadge status={request.status} />
      {actions.length > 0 ? (
        <RowActionsMenu
          label={t("team:timeOff.requests.actionsFor", { range })}
          actions={actions}
        />
      ) : (
        <span aria-hidden="true" className="size-8 shrink-0 sm:size-7" />
      )}
    </li>
  );
}
