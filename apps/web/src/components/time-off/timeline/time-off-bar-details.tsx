import { Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover";
import type { TimeOffEntry, TimeOffRequest } from "@/fetchers/time-off/types";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { isTimeOffRequest } from "@/lib/time-off/is-time-off-request";
import { TimeOffRequestFacts } from "../time-off-request-facts";

type TimeOffBarDetailsProps = {
  entry: TimeOffEntry;
  memberName: string;
  today: string;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (request: TimeOffRequest) => void;
};

export function TimeOffBarDetails({
  entry,
  memberName,
  today,
  onEdit,
  onCancel,
}: TimeOffBarDetailsProps) {
  const { t } = useTranslation();
  const request = isTimeOffRequest(entry) ? entry : null;
  const range = formatReleaseRange(entry.startDate, entry.endDate, { today });
  const canEdit = Boolean(request?.canEdit && onEdit);
  const canCancel = Boolean(request?.canCancel && onCancel);

  return (
    <div className="flex w-72 max-w-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <PopoverTitle className="truncate text-sm">{memberName}</PopoverTitle>
        <PopoverDescription className="text-xs">{range}</PopoverDescription>
      </div>
      {request ? (
        <TimeOffRequestFacts request={request} />
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("team:timeOff.details.private", { name: memberName })}
        </p>
      )}
      {request && (canEdit || canCancel) ? (
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onEdit?.(request)}
            >
              <Pencil aria-hidden="true" />
              {t("team:timeOff.details.edit")}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="xs"
              variant="destructive-outline"
              onClick={() => onCancel?.(request)}
            >
              <X aria-hidden="true" />
              {t("team:timeOff.details.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
