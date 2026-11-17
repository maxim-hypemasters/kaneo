import { useTranslation } from "react-i18next";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { TimeOffStatusBadge } from "./time-off-status-badge";
import { TIME_OFF_TYPE_STYLES } from "./time-off-type-styles";

// Type, status, weekdays and note: what only the person away and approvers
// see.
export function TimeOffRequestFacts({ request }: { request: TimeOffRequest }) {
  const { t } = useTranslation();
  const style = TIME_OFF_TYPE_STYLES[request.type];
  const Icon = style.icon;

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-muted-foreground">
        {t("team:timeOff.details.type")}
      </dt>
      <dd className="flex items-center gap-1.5">
        <Icon
          aria-hidden="true"
          className={cn("size-3.5", style.iconClassName)}
        />
        {t(style.labelKey)}
      </dd>
      <dt className="text-muted-foreground">
        {t("team:timeOff.details.status")}
      </dt>
      <dd>
        <TimeOffStatusBadge status={request.status} />
      </dd>
      <dt className="text-muted-foreground">
        {t("team:timeOff.details.days")}
      </dt>
      <dd className="tabular-nums">
        {t("team:timeOff.weekdays", { count: request.days })}
      </dd>
      {request.note ? (
        <>
          <dt className="self-start text-muted-foreground">
            {t("team:timeOff.details.note")}
          </dt>
          <dd className="whitespace-pre-wrap break-words">{request.note}</dd>
        </>
      ) : null}
    </dl>
  );
}
