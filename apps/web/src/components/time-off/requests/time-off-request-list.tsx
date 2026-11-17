import { TreePalm } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { TimeOffRequestRow } from "./time-off-request-row";

type TimeOffRequestListProps = {
  requests: readonly TimeOffRequest[];
  year: number;
  today: string;
  label: string;
  onEdit: (request: TimeOffRequest) => void;
  onCancel: (request: TimeOffRequest) => void;
  // Left out for people who can't request time off.
  onRequest?: () => void;
};

export function TimeOffRequestList({
  requests,
  year,
  today,
  label,
  onEdit,
  onCancel,
  onRequest,
}: TimeOffRequestListProps) {
  const { t } = useTranslation();

  if (requests.length === 0) {
    return (
      <Empty className="rounded-xl border py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TreePalm aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-base">
            {t("team:timeOff.requests.empty", { year })}
          </EmptyTitle>
          <EmptyDescription>
            {t("team:timeOff.requests.emptyHint")}
          </EmptyDescription>
        </EmptyHeader>
        {onRequest ? (
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={onRequest}>
              <TreePalm aria-hidden="true" />
              {t("team:timeOff.request")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <ul aria-label={label} className="rounded-xl border bg-card">
      {requests.map((request) => (
        <TimeOffRequestRow
          key={request.id}
          request={request}
          today={today}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      ))}
    </ul>
  );
}
