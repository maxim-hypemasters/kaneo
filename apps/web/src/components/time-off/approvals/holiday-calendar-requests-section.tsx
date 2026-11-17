import { type RefObject, useId } from "react";
import { useTranslation } from "react-i18next";
import type { PendingHolidayCalendarRequest } from "@/fetchers/time-off/types";
import type { TimelineMember } from "../timeline/timeline-members";
import { HolidayCalendarRequestRow } from "./holiday-calendar-request-row";
import { useFocusAfterDecision } from "./use-focus-after-decision";

type HolidayCalendarRequestsSectionProps = {
  workspaceId: string;
  requests: readonly PendingHolidayCalendarRequest[];
  membersById: ReadonlyMap<string, TimelineMember>;
  viewerId?: string;
  today: string;
  // The calendar names' language, as in the list query.
  lang: string;
  // Takes focus once the last request has left, along with this section.
  fallbackFocusRef: RefObject<HTMLElement | null>;
};

// Public holiday calendar changes waiting for approval, oldest first. It
// stays mounted while empty and renders nothing, so focus still moves on
// after the last decision.
export function HolidayCalendarRequestsSection({
  workspaceId,
  requests,
  membersById,
  viewerId,
  today,
  lang,
  fallbackFocusRef,
}: HolidayCalendarRequestsSectionProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const focus = useFocusAfterDecision(requests, fallbackFocusRef);

  if (requests.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mt-4 flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="font-medium text-sm">
          {t("team:timeOff.approvals.calendarTitle")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("team:timeOff.approvals.calendarHint")}
        </p>
      </div>
      <ul
        ref={focus.listRef}
        aria-labelledby={headingId}
        className="rounded-xl border bg-card"
      >
        {requests.map((request, index) => (
          <HolidayCalendarRequestRow
            key={request.id}
            workspaceId={workspaceId}
            request={request}
            member={membersById.get(request.userId)}
            isViewer={request.userId === viewerId}
            today={today}
            lang={lang}
            onDecided={() => focus.onDecided(request.id, index)}
          />
        ))}
      </ul>
    </section>
  );
}
