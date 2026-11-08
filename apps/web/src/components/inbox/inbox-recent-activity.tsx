import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Activity from "@/components/activity";
import type { ActivitySubject } from "@/components/activity/describe-subject-activity";
import { Skeleton } from "@/components/ui/skeleton";
import { Timeline } from "@/components/ui/timeline";
import type useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";

export const INBOX_VISIBLE_ACTIVITIES = 6;

type InboxRecentActivityProps = {
  query: Pick<
    ReturnType<typeof useGetActivitiesByTaskId>,
    "data" | "isPending" | "isError"
  >;
  subject?: ActivitySubject;
  children?: ReactNode;
};

// The latest few events of a notification's item, with room for a reply.
export function InboxRecentActivity({
  query,
  subject,
  children,
}: InboxRecentActivityProps) {
  const { t } = useTranslation();
  const recent = (query.data ?? []).slice(0, INBOX_VISIBLE_ACTIVITIES);

  return (
    <div className="flex flex-col gap-3 border-border/60 border-t pt-5">
      <h3 className="font-medium text-muted-foreground text-xs">
        {t("notifications:inbox.recentActivity")}
      </h3>
      {query.isPending ? (
        <Skeleton
          aria-label={t("common:empty.loading")}
          className="h-24 w-full"
        />
      ) : query.isError && !query.data ? (
        <p role="alert" className="text-muted-foreground text-sm">
          {t("workspace:home.activity.loadError")}
        </p>
      ) : (
        recent.length > 0 && (
          <Timeline>
            {recent.map((activity, index) => (
              <Activity
                key={activity.id}
                activity={activity}
                step={recent.length - index}
                subject={subject}
              />
            ))}
          </Timeline>
        )
      )}
      {children}
    </div>
  );
}
